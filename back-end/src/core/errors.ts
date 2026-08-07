/**
 * Input the caller got wrong, as opposed to something that went wrong.
 *
 * Thrown by the parsers in this directory, which know nothing about HTTP. Each
 * adapter maps it to whatever its transport calls a client error — a 400 over
 * Express, a returned failure over IPC. Anything else escaping a core function is
 * a fault, and both adapters treat it as one.
 */
export class BadRequestError extends Error {}
