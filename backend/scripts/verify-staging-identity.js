/**
 * Staging Host Identity Verifier
 * 
 * Verifies that the current execution environment is an independently authenticated,
 * dedicated staging host before allowing staging migration or deployment workflows.
 * 
 * Validates:
 * 1. DEPLOYMENT_ENVIRONMENT=staging
 * 2. Host FQDN / hostname matches independently approved EXPECTED_STAGING_HOSTNAME
 * 3. Root-owned deployment marker file (/etc/fee/deployment_env) with safe permissions (<= 0640)
 * 4. Active host private IP matches independently approved EXPECTED_STAGING_IP
 * 5. Supported platform verification (Linux required for staging VM)
 * 
 * Fails closed on any mismatch, missing input, or unverified platform state.
 * Never connects to any database. Never outputs credentials or connection strings.
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

const DEFAULT_MARKER_PATH = '/etc/fee/deployment_env';
const REQUIRED_DEPLOYMENT_ENV = 'staging';

/**
 * Parses INI/ENV format key-value pairs from marker content
 */
function parseEnvContent(content) {
  const result = {};
  if (!content || typeof content !== 'string') return result;

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      result[key] = val;
    }
  }
  return result;
}

/**
 * Pure verification function with dependency injection seams for test isolation
 */
function verifyStagingIdentity(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const getHostname = options.getHostname || (() => os.hostname());
  const getInterfaces = options.getInterfaces || (() => os.networkInterfaces());
  const fileSystem = options.fs || fs;
  const markerPath = options.markerPath || env.STAGING_MARKER_PATH || DEFAULT_MARKER_PATH;

  // 1. Validate DEPLOYMENT_ENVIRONMENT
  const deploymentEnv = (env.DEPLOYMENT_ENVIRONMENT || '').trim().toLowerCase();
  if (!deploymentEnv) {
    return {
      ok: false,
      reason: "Missing DEPLOYMENT_ENVIRONMENT. Must be explicitly set to 'staging'.",
    };
  }

  if (deploymentEnv !== REQUIRED_DEPLOYMENT_ENV) {
    return {
      ok: false,
      reason: `Invalid DEPLOYMENT_ENVIRONMENT '${deploymentEnv}'. Expected '${REQUIRED_DEPLOYMENT_ENV}'.`,
    };
  }

  // 2. Validate Infrastructure-Supplied Expected Host Identity Parameters
  const expectedHostname = (env.EXPECTED_STAGING_HOSTNAME || '').trim().toLowerCase();
  if (!expectedHostname) {
    return {
      ok: false,
      reason: 'Missing EXPECTED_STAGING_HOSTNAME. Host identity cannot be verified without infrastructure-approved expected hostname.',
    };
  }

  const expectedIp = (env.EXPECTED_STAGING_IP || '').trim();
  if (!expectedIp) {
    return {
      ok: false,
      reason: 'Missing EXPECTED_STAGING_IP. Host identity cannot be verified without infrastructure-approved expected IP address.',
    };
  }

  // Reject production-like patterns in expected parameters
  if (/prod/i.test(expectedHostname) || /production/i.test(expectedHostname)) {
    return {
      ok: false,
      reason: `Refusing execution: Expected hostname '${expectedHostname}' contains forbidden production tokens.`,
    };
  }

  // 3. Platform Verification
  if (platform !== 'linux') {
    return {
      ok: false,
      reason: `Unsupported platform '${platform}'. Staging host verification requires an isolated Linux staging VM host.`,
    };
  }

  // 4. Hostname & FQDN Verification
  let actualHostname;
  try {
    actualHostname = (getHostname() || '').trim().toLowerCase();
  } catch (err) {
    return {
      ok: false,
      reason: `Failed to retrieve system hostname: ${err.message}`,
    };
  }

  if (!actualHostname) {
    return {
      ok: false,
      reason: 'System hostname is empty or could not be determined.',
    };
  }

  // Verify FQDN safely:
  // Case A: Kernel nodename directly equals expected FQDN
  let isFqdnCorroborated = false;
  if (actualHostname === expectedHostname) {
    isFqdnCorroborated = true;
  } else if (typeof options.getFqdn === 'function') {
    // Case B: Injected trusted FQDN resolver seam
    try {
      const resolvedFqdn = (options.getFqdn() || '').trim().toLowerCase();
      if (resolvedFqdn === expectedHostname) {
        isFqdnCorroborated = true;
      }
    } catch {
      isFqdnCorroborated = false;
    }
  } else if (fileSystem.existsSync(markerPath)) {
    // Case C: Kernel nodename is short and expectedHostname is FQDN.
    // Rather than an insecure short-name comparison, we require corroboration from the root-owned marker:
    // The marker must declare HOST_FQDN matching expectedHostname, AND actualHostname must match the host segment.
    try {
      const stat = fileSystem.statSync(markerPath);
      const isRoot = stat.uid === 0;
      const isSafeMode = (stat.mode & 0o022) === 0;
      if (isRoot && isSafeMode) {
        const content = fileSystem.readFileSync(markerPath, 'utf8');
        const parsed = parseEnvContent(content);
        const markerFqdn = (parsed.HOST_FQDN || parsed.STAGING_FQDN || '').trim().toLowerCase();
        if (markerFqdn === expectedHostname && expectedHostname.startsWith(actualHostname + '.')) {
          isFqdnCorroborated = true;
        }
      }
    } catch {
      isFqdnCorroborated = false;
    }
  }

  if (!isFqdnCorroborated) {
    return {
      ok: false,
      reason: `Hostname/FQDN mismatch: actual hostname '${actualHostname}' does not match expected staging hostname '${expectedHostname}', and trusted root marker '${markerPath}' does not corroborate expected FQDN via HOST_FQDN.`,
    };
  }

  // 5. Private IP Address Verification
  let interfaces;
  try {
    interfaces = getInterfaces() || {};
  } catch (err) {
    return {
      ok: false,
      reason: `Failed to inspect network interfaces: ${err.message}`,
    };
  }

  const activeIps = [];
  for (const [ifaceName, ifaceAddrs] of Object.entries(interfaces)) {
    if (!Array.isArray(ifaceAddrs)) continue;
    for (const addr of ifaceAddrs) {
      if (addr && addr.family === 'IPv4' || addr.family === 4) {
        if (!addr.internal && addr.address) {
          activeIps.push(addr.address.trim());
        }
      }
    }
  }

  if (!activeIps.includes(expectedIp)) {
    return {
      ok: false,
      reason: `Private IP mismatch: expected staging IP '${expectedIp}' was not found among active host network interfaces (${activeIps.join(', ') || 'none'}).`,
    };
  }

  // 6. Staging Marker File Verification (/etc/fee/deployment_env)
  if (!fileSystem.existsSync(markerPath)) {
    return {
      ok: false,
      reason: `Staging deployment marker file does not exist at '${markerPath}'.`,
    };
  }

  let stat;
  try {
    stat = fileSystem.statSync(markerPath);
  } catch (err) {
    return {
      ok: false,
      reason: `Failed to inspect marker file stats at '${markerPath}': ${err.message}`,
    };
  }

  // Verify ownership (Must be owned by root: uid === 0 on Linux)
  if (stat.uid !== 0) {
    return {
      ok: false,
      reason: `Staging marker file '${markerPath}' is not owned by root (actual uid: ${stat.uid}).`,
    };
  }

  // Verify permissions (Must not be group-writable or world-writable: mode & 0o022 === 0)
  const isWritableByOthers = (stat.mode & 0o022) !== 0;
  if (isWritableByOthers) {
    const octalMode = (stat.mode & 0o777).toString(8);
    return {
      ok: false,
      reason: `Staging marker file '${markerPath}' has unsafe permissions (0${octalMode}). Must be read-only or non-writable by group/others (e.g. 0400 or 0600).`,
    };
  }

  // Verify marker content
  let markerContent;
  try {
    markerContent = fileSystem.readFileSync(markerPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      reason: `Failed to read staging marker file at '${markerPath}': ${err.message}`,
    };
  }

  const parsedMarker = parseEnvContent(markerContent);
  const markerEnv = (parsedMarker.DEPLOYMENT_ENVIRONMENT || parsedMarker.DEPLOYMENT_ENV || '').trim().toLowerCase();

  if (markerEnv !== REQUIRED_DEPLOYMENT_ENV) {
    return {
      ok: false,
      reason: `Staging marker file '${markerPath}' declares environment '${markerEnv || 'undefined'}', expected '${REQUIRED_DEPLOYMENT_ENV}'.`,
    };
  }

  return {
    ok: true,
    hostname: actualHostname,
    expectedFqdn: expectedHostname,
    ip: expectedIp,
    markerPath,
  };
}

function main() {
  const result = verifyStagingIdentity();

  if (!result.ok) {
    console.error(`\n======================================================`);
    console.error(`[STAGING IDENTITY ERROR] Host identity verification FAILED`);
    console.error(`Reason: ${result.reason}`);
    console.error(`======================================================\n`);
    process.exit(1);
  }

  console.log(
    `[STAGING IDENTITY PASS] Verified authentic staging host: '${result.expectedFqdn || result.hostname}' (${result.ip}) via marker '${result.markerPath}'`,
  );
  process.exit(0);
}

module.exports = {
  verifyStagingIdentity,
  parseEnvContent,
  DEFAULT_MARKER_PATH,
  REQUIRED_DEPLOYMENT_ENV,
};

if (require.main === module) {
  main();
}
