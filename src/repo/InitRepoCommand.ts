import { AbstractCommand, Command, Handler } from "../../deps.ts";

const DENO_PKG_ROOT = "https://denopkg.com/partic11e/p11/resources/repo";
const files = [
  ".gitignore",
  "LICENSE",
  "README.md",
  "CONTRIBUTING.md",
];

@Command({
  name: "init",
  description: "Initializes a default GitHub repository with consistent resources.",
  version: "0.0",
  permissions: [
    {name: "run", command: "git"},
    {name: "net", host: "denopkg.com"},
    {name: "net", host: "api.github"},
    ...files.map(file => ({
      name: "write",
      path: file
    } as Deno.PermissionDescriptor)),
  ],
})
export class InitRepoCommand extends AbstractCommand {
  @Handler({
    when:() => true
  })
  public async initRepo() {
    this.log("Initializing repo");
    await this.#copyFiles();
  }

  async #copyFiles() {
    this.logVerbose("Copying files...");
    await Promise.all(files.map(async (file) => await this.#copyFile(file)));

  }

  async #copyFile(file: string) {
    const req = await fetch(`${DENO_PKG_ROOT}/${file}`);
  }
}
