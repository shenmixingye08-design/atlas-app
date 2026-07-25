export class BusinessProfileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BusinessProfileError";
    this.code = code;
  }
}
