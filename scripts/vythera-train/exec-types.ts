export type ExecFn = (
  cmd: string,
  args: string[],
  opts?: { timeout?: number },
) => { status: number | null; stdout: string; stderr: string };
