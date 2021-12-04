import logfmt from "logfmt";

export enum logLevel {
  Debug = "debug",
  Info = "info",
  Warning = "warning",
  Panic = "panic",
  Fatal = "fatal",
}

export function log(log: { level: logLevel; msg: string }, additional?: Record<string, unknown>) {
  logfmt.log({ ...{ time: `${new Date().toISOString()}` }, ...log, ...additional });
}
