/**
 * Isolated Unit Tests for Staging Host Identity Verifier
 * 
 * Tests the fail-closed staging host verification logic using strictly mocked
 * system attributes, mocked filesystem, and synthetic network interfaces.
 * Zero database connections, zero external network calls, zero live filesystem mutations.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { verifyStagingIdentity, parseEnvContent } = require('../../scripts/verify-staging-identity');

describe('Staging Host Identity Verifier (Phase R1.23)', () => {
  const validMockEnv = {
    DEPLOYMENT_ENVIRONMENT: 'staging',
    EXPECTED_STAGING_HOSTNAME: 'staging-fee-vm01.internal',
    EXPECTED_STAGING_IP: '10.100.1.50',
    STAGING_MARKER_PATH: '/mock/etc/fee/deployment_env',
  };

  const validMockNetworkInterfaces = {
    eth0: [
      {
        address: '10.100.1.50',
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: '00:11:22:33:44:55',
        internal: false,
      },
    ],
    lo: [
      {
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
      },
    ],
  };

  const validMockStat = {
    uid: 0, // root
    mode: 0o100400, // regular file, mode 0400 (read-only owner)
  };

  const validMockMarkerContent = `
# Staging Environment Marker
DEPLOYMENT_ENVIRONMENT=staging
HOST_ROLE=monolithic_staging_host
PROVISIONED_BY=infrastructure_team
`;

  interface MockFsOverrides {
  exists?: boolean;
  statError?: string;
  readError?: string;
  uid?: number;
  mode?: number;
  content?: string;
}

function createMockFs(overrides: MockFsOverrides = {}) {
    return {
      existsSync: jest.fn((path) => {
        if (overrides.exists !== undefined) return overrides.exists;
        return true;
      }),
      statSync: jest.fn((path) => {
        if (overrides.statError) throw new Error(overrides.statError);
        return {
          uid: overrides.uid !== undefined ? overrides.uid : validMockStat.uid,
          mode: overrides.mode !== undefined ? overrides.mode : validMockStat.mode,
        };
      }),
      readFileSync: jest.fn((path, encoding) => {
        if (overrides.readError) throw new Error(overrides.readError);
        return overrides.content !== undefined ? overrides.content : validMockMarkerContent;
      }),
    };
  }

  // --------------------------------------------------------------------------
  // Core Requirement Tests
  // --------------------------------------------------------------------------

  it('1. should reject when DEPLOYMENT_ENVIRONMENT is missing', () => {
    const env = { ...validMockEnv };
    delete env.DEPLOYMENT_ENVIRONMENT;

    const res = verifyStagingIdentity({ env });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Missing DEPLOYMENT_ENVIRONMENT/i);
  });

  it('2. should reject when DEPLOYMENT_ENVIRONMENT is not staging (e.g. production/dev)', () => {
    const env = { ...validMockEnv, DEPLOYMENT_ENVIRONMENT: 'production' };
    const res = verifyStagingIdentity({ env });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Invalid DEPLOYMENT_ENVIRONMENT 'production'/i);
  });

  it('3. should reject when EXPECTED_STAGING_HOSTNAME is missing', () => {
    const env = { ...validMockEnv };
    delete env.EXPECTED_STAGING_HOSTNAME;

    const res = verifyStagingIdentity({ env });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Missing EXPECTED_STAGING_HOSTNAME/i);
  });

  it('4. should reject when EXPECTED_STAGING_IP is missing', () => {
    const env = { ...validMockEnv };
    delete env.EXPECTED_STAGING_IP;

    const res = verifyStagingIdentity({ env });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Missing EXPECTED_STAGING_IP/i);
  });

  it('5. should reject if expected hostname contains forbidden production tokens', () => {
    const env = { ...validMockEnv, EXPECTED_STAGING_HOSTNAME: 'prod-fee-vm01.internal' };
    const res = verifyStagingIdentity({ env });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/contains forbidden production tokens/i);
  });

  it('6. should reject unsupported platforms (e.g. win32 / darwin outside Linux)', () => {
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'win32',
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Unsupported platform 'win32'/i);
  });

  it('7. should reject when hostname retrieval fails or returns empty', () => {
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => '',
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/System hostname is empty/i);
  });

  it('8. should reject when actual hostname does not match expected staging hostname', () => {
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'dev-laptop-workstation',
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Hostname.*mismatch: actual hostname 'dev-laptop-workstation'/i);
  });

  it('9. should reject when network interfaces retrieval throws an error', () => {
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => {
        throw new Error('EPERM: cannot inspect network');
      },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Failed to inspect network interfaces/i);
  });

  it('10. should reject when expected staging IP is not found on any active non-internal interface', () => {
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => ({
        eth0: [{ address: '192.168.1.100', family: 'IPv4', internal: false }],
      }),
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Private IP mismatch: expected staging IP '10.100.1.50'/i);
  });

  it('11. should reject when staging marker file does not exist', () => {
    const mockFs = createMockFs({ exists: false });
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/marker file does not exist/i);
  });

  it('12. should reject when stat inspection on marker file fails', () => {
    const mockFs = createMockFs({ statError: 'EACCES: permission denied' });
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Failed to inspect marker file stats/i);
  });

  it('13. should reject when marker file is not owned by root (uid !== 0)', () => {
    const mockFs = createMockFs({ uid: 1000 }); // non-root user
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/not owned by root \(actual uid: 1000\)/i);
  });

  it('14. should reject when marker file has unsafe group/world-writable permissions (mode & 0o022 !== 0)', () => {
    // Mode 0666 (rw-rw-rw-) -> unsafe!
    const mockFs = createMockFs({ mode: 0o100666 });
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/unsafe permissions/i);
  });

  it('15. should reject when reading marker file throws an error', () => {
    const mockFs = createMockFs({ readError: 'EIO: I/O error' });
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Failed to read staging marker file/i);
  });

  it('16. should reject when marker file declares an unapproved environment (e.g. development)', () => {
    const mockFs = createMockFs({ content: 'DEPLOYMENT_ENVIRONMENT=development\n' });
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/declares environment 'development', expected 'staging'/i);
  });

  it('17. should reject when marker file has missing or empty environment declaration', () => {
    const mockFs = createMockFs({ content: '# Only comments here\nFOO=BAR\n' });
    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/declares environment 'undefined', expected 'staging'/i);
  });

  it('18. should successfully approve when all 5 host identity factors are valid and verified', () => {
    const mockFs = createMockFs({
      uid: 0,
      mode: 0o100400, // read-only owner
      content: validMockMarkerContent,
    });

    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });

    expect(res.ok).toBe(true);
    expect(res.hostname).toBe('staging-fee-vm01.internal');
    expect(res.ip).toBe('10.100.1.50');
    expect(res.markerPath).toBe(validMockEnv.STAGING_MARKER_PATH);
  });

  it('19. should approve when marker uses DEPLOYMENT_ENV alias', () => {
    const mockFs = createMockFs({
      uid: 0,
      mode: 0o100600,
      content: 'DEPLOYMENT_ENV=staging\n',
    });

    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });

    expect(res.ok).toBe(true);
    expect(res.hostname).toBe('staging-fee-vm01.internal');
  });

  it('21. should approve when actual nodename is short and root marker corroborates expected FQDN via HOST_FQDN', () => {
    const markerWithFqdn = `
DEPLOYMENT_ENVIRONMENT=staging
HOST_FQDN=staging-fee-vm01.internal
PROVISIONED_BY=infrastructure_team
`;
    const mockFs = createMockFs({
      uid: 0,
      mode: 0o100400,
      content: markerWithFqdn,
    });

    const res = verifyStagingIdentity({
      env: validMockEnv, // EXPECTED_STAGING_HOSTNAME: 'staging-fee-vm01.internal'
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01', // short nodename
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });

    expect(res.ok).toBe(true);
    expect(res.hostname).toBe('staging-fee-vm01');
    expect(res.expectedFqdn).toBe('staging-fee-vm01.internal');
  });

  it('22. should reject when actual nodename is short and root marker lacks HOST_FQDN declaration', () => {
    const markerWithoutFqdn = `
DEPLOYMENT_ENVIRONMENT=staging
PROVISIONED_BY=infrastructure_team
`;
    const mockFs = createMockFs({
      uid: 0,
      mode: 0o100400,
      content: markerWithoutFqdn,
    });

    const res = verifyStagingIdentity({
      env: validMockEnv, // EXPECTED_STAGING_HOSTNAME: 'staging-fee-vm01.internal'
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01', // short nodename
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/trusted root marker .* does not corroborate expected FQDN via HOST_FQDN/i);
  });

  it('23. should reject when actual nodename is short and root marker declares mismatched HOST_FQDN', () => {
    const markerMismatchedFqdn = `
DEPLOYMENT_ENVIRONMENT=staging
HOST_FQDN=staging-other-host.internal
`;
    const mockFs = createMockFs({
      uid: 0,
      mode: 0o100400,
      content: markerMismatchedFqdn,
    });

    const res = verifyStagingIdentity({
      env: validMockEnv, // EXPECTED_STAGING_HOSTNAME: 'staging-fee-vm01.internal'
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Hostname\/FQDN mismatch/i);
  });

  it('24. should reject when actual nodename does not match host prefix of expected FQDN even if marker declares expected FQDN', () => {
    const markerWithFqdn = `
DEPLOYMENT_ENVIRONMENT=staging
HOST_FQDN=staging-fee-vm01.internal
`;
    const mockFs = createMockFs({
      uid: 0,
      mode: 0o100400,
      content: markerWithFqdn,
    });

    const res = verifyStagingIdentity({
      env: validMockEnv, // EXPECTED_STAGING_HOSTNAME: 'staging-fee-vm01.internal'
      platform: 'linux',
      getHostname: () => 'different-nodename', // wrong machine!
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Hostname\/FQDN mismatch/i);
  });

  it('25. should approve when getFqdn seam provides verified FQDN', () => {
    const mockFs = createMockFs({
      uid: 0,
      mode: 0o100400,
      content: validMockMarkerContent,
    });

    const res = verifyStagingIdentity({
      env: validMockEnv,
      platform: 'linux',
      getHostname: () => 'staging-fee-vm01',
      getFqdn: () => 'staging-fee-vm01.internal',
      getInterfaces: () => validMockNetworkInterfaces,
      fs: mockFs,
    });

    expect(res.ok).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Helper & Parser Tests
  // --------------------------------------------------------------------------

  describe('parseEnvContent utility', () => {
    it('20. should parse env content handling comments, quotes, and whitespace correctly', () => {
      const sample = `
        # Header comment
        KEY_ONE="value_one"
        KEY_TWO='value_two'
        KEY_THREE = value_three
        # Ignored comment
        INVALID_LINE_WITHOUT_EQUALS
      `;
      const parsed = parseEnvContent(sample);
      expect(parsed.KEY_ONE).toBe('value_one');
      expect(parsed.KEY_TWO).toBe('value_two');
      expect(parsed.KEY_THREE).toBe('value_three');
      expect(parsed.INVALID_LINE_WITHOUT_EQUALS).toBeUndefined();
    });

    it('should return empty object on empty or non-string input', () => {
      expect(parseEnvContent('')).toEqual({});
      expect(parseEnvContent(null)).toEqual({});
      expect(parseEnvContent(undefined)).toEqual({});
    });
  });
});
