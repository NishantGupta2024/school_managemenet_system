declare module 'pizzip' {
  class PizZip {
    constructor(content?: any, options?: any);
    load(content: any, options?: any): this;
    file(name: string): any;
    file(name: string, content: any, options?: any): this;
    generate(options?: any): any;
    files: { [path: string]: any };
  }
  export = PizZip;
}
