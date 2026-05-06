export interface FsReader {
  /** List entries (files and directories) at a path. Paths use forward slashes, relative to repo root. */
  readDir(path: string): Promise<Array<{ name: string; isDir: boolean }>>;
  /** Read a UTF-8 file. Throws if missing. */
  readFile(path: string): Promise<string>;
  /** Check if a path exists (file or dir). */
  exists(path: string): Promise<boolean>;
}
