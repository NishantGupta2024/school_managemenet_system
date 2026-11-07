import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface ReceiptPdfEngine {
  readonly engineName: string;
  isAvailable(): Promise<boolean>;
  convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer>;
}

@Injectable()
export class DisabledPdfEngine implements ReceiptPdfEngine {
  readonly engineName = 'DISABLED_NO_ENGINE';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async convertDocxToPdf(): Promise<Buffer> {
    throw new ServiceUnavailableException(
      'Receipt PDF conversion engine is unavailable. Please configure a Gotenberg microservice or install LibreOffice on the host server.',
    );
  }
}

@Injectable()
export class LibreOfficeCliPdfEngine implements ReceiptPdfEngine {
  readonly engineName = 'LIBREOFFICE_HEADLESS_CLI';
  private readonly logger = new Logger(LibreOfficeCliPdfEngine.name);

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const cmd = process.platform === 'win32' ? 'soffice.exe' : 'soffice';
      childProcess.execFile(cmd, ['--version'], { timeout: 3000 }, (error) => {
        resolve(!error);
      });
    });
  }

  async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'receipt-docx-'));
    const docxPath = path.join(tmpDir, 'input.docx');
    const pdfPath = path.join(tmpDir, 'input.pdf');
    const profileDir = path.join(tmpDir, 'profile');

    try {
      await fs.promises.writeFile(docxPath, docxBuffer);
      await fs.promises.mkdir(profileDir, { recursive: true });
      const cmd = process.platform === 'win32' ? 'soffice.exe' : 'soffice';
      const profileUri = `file:///${profileDir.replace(/\\/g, '/')}`;

      await new Promise<void>((resolve, reject) => {
        childProcess.execFile(
          cmd,
          [
            `-env:UserInstallation=${profileUri}`,
            '--headless',
            '--convert-to',
            'pdf',
            '--outdir',
            tmpDir,
            docxPath,
          ],
          { timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              this.logger.error(`LibreOffice conversion failed: ${error.message}. Stderr: ${stderr}`);
              return reject(new InternalServerErrorException('Document conversion failed in LibreOffice engine'));
            }
            resolve();
          },
        );
      });

      if (!fs.existsSync(pdfPath)) {
        throw new InternalServerErrorException('LibreOffice did not produce an output PDF file');
      }

      const pdfBuffer = await fs.promises.readFile(pdfPath);
      return pdfBuffer;
    } finally {
      // Clean up temporary files
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch (err: any) {
        this.logger.warn(`Failed removing temporary directory ${tmpDir}: ${err.message}`);
      }
    }
  }
}

@Injectable()
export class GotenbergPdfEngine implements ReceiptPdfEngine {
  readonly engineName = 'GOTENBERG_HTTP_SERVICE';
  private readonly logger = new Logger(GotenbergPdfEngine.name);
  private readonly gotenbergUrl: string;

  constructor() {
    this.gotenbergUrl = (process.env.GOTENBERG_URL || '').replace(/\/$/, '');
  }

  async isAvailable(): Promise<boolean> {
    if (!this.gotenbergUrl) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.gotenbergUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    if (!this.gotenbergUrl) {
      throw new ServiceUnavailableException('Gotenberg URL is not configured');
    }

    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(docxBuffer)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      formData.append('files', blob, 'receipt.docx');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${this.gotenbergUrl}/forms/libreoffice/convert`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new InternalServerErrorException(`Gotenberg responded with status ${res.status}`);
      }

      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch (err: any) {
      this.logger.error(`Gotenberg conversion error: ${err.message}`);
      throw new InternalServerErrorException('Gotenberg document conversion failed');
    }
  }
}

@Injectable()
export class ReceiptPdfEngineService {
  private readonly logger = new Logger(ReceiptPdfEngineService.name);
  private readonly disabledEngine = new DisabledPdfEngine();
  private readonly libreOfficeEngine = new LibreOfficeCliPdfEngine();
  private readonly gotenbergEngine = new GotenbergPdfEngine();

  /**
   * Resolves the primary available engine or returns the disabled engine.
   */
  public async getActiveEngine(): Promise<ReceiptPdfEngine> {
    // 1. Check Gotenberg if configured
    if (process.env.GOTENBERG_URL && (await this.gotenbergEngine.isAvailable())) {
      return this.gotenbergEngine;
    }

    // 2. Check local LibreOffice CLI
    if (await this.libreOfficeEngine.isAvailable()) {
      return this.libreOfficeEngine;
    }

    // 3. Fallback: No engine available
    return this.disabledEngine;
  }

  /**
   * Checks whether any valid PDF conversion engine is operational.
   */
  public async isEngineAvailable(): Promise<boolean> {
    const engine = await this.getActiveEngine();
    return engine.isAvailable();
  }

  /**
   * Validates generated PDF buffer for standard magic bytes and minimal size.
   */
  public validatePdfBuffer(buffer: Buffer): void {
    if (!buffer || buffer.length < 500) {
      throw new InternalServerErrorException('Generated PDF is truncated or empty');
    }
    const header = buffer.subarray(0, 5).toString('ascii');
    if (header !== '%PDF-') {
      throw new InternalServerErrorException('Generated output is missing standard %PDF- header');
    }
  }

  /**
   * Converts a DOCX buffer to PDF using the active engine.
   */
  public async convertToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const engine = await this.getActiveEngine();
    if (!(await engine.isAvailable())) {
      throw new ServiceUnavailableException(
        'Receipt PDF conversion engine is unavailable. Please configure Gotenberg or install LibreOffice on the host server.',
      );
    }
    const pdf = await engine.convertDocxToPdf(docxBuffer);
    this.validatePdfBuffer(pdf);
    return pdf;
  }
}
