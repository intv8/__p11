import { AbstractCommand, Command, Handler, Option } from "../../../deps.ts";
import type { IGitHubIssueLabel } from "../types.ts";

const DENO_PKG_ROOT = "https://denopkg.com/partic11e/p11@dev/resources/repo";
const DENO_PKG_SCAFFOLD =  "https://denopkg.com/partic11e/p11@dev/resources/templates";
const GH_API_ROOT = "https://api.github.com/repos";
const files = [
  ".gitignore",
  "LICENSE",
  "README.md",
  "CONTRIBUTING.md",
];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

@Command({
  name: "init",
  description:
    "Initializes a default GitHub repository with consistent resources.",
  version: "0.0",
  permissions: [
    { name: "run", command: "git" },
    { name: "net", host: "denopkg.com" },
    { name: "net", host: "api.github.com" },
    ...files.map((file) => ({
      name: "write",
      path: file,
    } as Deno.PermissionDescriptor)),
  ],
})
export class InitRepoCommand extends AbstractCommand {
  @Option({
    type: "string",
    env: "GH_WEB_API_TOKEN",
    shorthand: "t",
    description:
      "Your GitHub token. Can be read from the GH_WEB_API_TOKEN environment variable.",
  })
  public ghToken = "";

  @Option({
    type: "string",
    shorthand: "s",
    description: "The scaffold to use to initialize the repository."
  })
  public scaffold = "module";

  @Handler({
    when: () => true,
  })
  public async initRepo(): Promise<void> {
    const { org, repo } = await this.#getRepoInfo();
    const resp = await fetch(`${DENO_PKG_SCAFFOLD}/${this.scaffold}.scaffold.json`);
    if (resp.status !== 200) {
      this.log(`No scaffold for "${this.scaffold}"`);
    }

    if (!this.ghToken) {
      this.ghToken = prompt("Please enter you GitHub API token.") || "";
      Deno.exit(1);
    }

    if (!this.ghToken) {
      this.logVerbose("Exiting due to no GitHub API token.");

      return Deno.exit(1);
    }

    this.log("Initializing repo");

    await this.#copyFiles();
    await this.#updateLabels(org, repo);

    this.log("Initialization done");
  }

  async #getRepoInfo(): Promise<{ org: string; repo: string }> {
    const regex = /([\w\-]+)\/([\w\-]+)\.git/;
    const cmd = Deno.run({
      cmd: ["git", "remote", "-v"],
      stdout: "piped",
      stdin: "piped",
    });

    const output = await cmd.output();
    const outStr = decoder.decode(output);
    const [line] = outStr.split("\n");
    const matches = regex.exec(line || "");

    if (!line || !matches) {
      throw new Error(
        `Unable to get git repo info for path ${import.meta.url}`,
      );
    }

    const [_match, org, repo] = matches;

    return { org, repo };
  }

  async #copyFiles(): Promise<void> {
    this.log("Copying files");
    await Promise.all(files.map(async (file) => {
      this.logVerbose(`Downloading "${DENO_PKG_ROOT}${file}" to "${file}".`);

      await this.#copyFile(file);

      this.logVerbose(`${file} - Done`);
    }));
    this.log("File copy complete");
  }

  async #copyFile(file: string): Promise<void> {
    const url = `${DENO_PKG_ROOT}/${file}`;
    const resp = await fetch(url);
    const text = await resp.text();

    this.logVerbose(`${file} - ${resp.statusText}`);

    const formattedText = await this.#formatText(text);

    await Deno.writeFile(file, encoder.encode(formattedText));
  }

  async #formatText(text: string): Promise<string> {
    const repoData = await this.#getRepoInfo();
    const data = {
      ...repoData,
      currentYear: (new Date()).getFullYear().toString(),
    };

    return Object.keys(data).reduce((prev, key) => {
      const rx = new RegExp(`\{\{${key}}}`, "gm");
      const value = data[key as keyof typeof data];

      return prev.replace(rx, value);
    }, text);
  }

  async #updateLabels(org: string, repo: string) {
    this.log("Checking issue labels");
    const templateLabels = await this.#getTemplateLabels();
    const currentLabels = await this.#getRepoLabels(org, repo);
    const templateJson = JSON.stringify(templateLabels.map((label) => {
      const {
        id: _id,
        node_id: _node_id,
        default: _default,
        url: _url,
        ...rest
      } = label;

      return rest;
    }));
    const currentJson = JSON.stringify(currentLabels.map((label) => {
      const {
        id: _id,
        node_id: _node_id,
        default: _default,
        url: _url,
        ...rest
      } = label;

      return rest;
    }));

    if (templateJson === currentJson) {
      this.log(`Issue labels are okay`);

      return;
    }

    this.log("Migrating issue labels");

    await this.#deleteLabels(org, repo, currentLabels);
    await this.#createLabels(org, repo, templateLabels);

    this.log("Migrated issue labels");
  }

  async #createLabel(
    org: string,
    repo: string,
    label: Omit<IGitHubIssueLabel, "id" | "node_id" | "url" | "default">,
  ) {
    const url = `${GH_API_ROOT}/${org}/${repo}/labels`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${this.ghToken}`,
      },
      body: JSON.stringify(label),
    });

    this.logVerbose(url, resp.statusText);

    return await resp.json();
  }

  async #createLabels(org: string, repo: string, labels: IGitHubIssueLabel[]) {
    await Promise.all(
      labels.map(
        async ({ id: _i, node_id: _n, default: _d, url: _u, ...rest }) => {
          await this.#createLabel(org, repo, rest);
        },
      ),
    );
  }

  async #deleteLabel(org: string, repo: string, name: string) {
    const url = `${GH_API_ROOT}/${org}/${repo}/labels/${name}`;
    const resp = await fetch(url, {
      method: "DELETE",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${this.ghToken}`,
      },
    });

    this.logVerbose(url, resp.statusText);
    return resp.status;
  }

  async #deleteLabels(org: string, repo: string, labels: IGitHubIssueLabel[]) {
    await Promise.all(labels.map(async ({ name }) => {
      await this.#deleteLabel(org, repo, name);
    }));
  }

  async #getTemplateLabels() {
    const resp = await fetch(`${DENO_PKG_ROOT}/_labels.json`);

    return await resp.json() as IGitHubIssueLabel[];
  }

  async #getRepoLabels(
    org: string,
    repo: string,
  ): Promise<IGitHubIssueLabel[]> {
    const resp = await fetch(`${GH_API_ROOT}/${org}/${repo}/labels`, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `token ${this.ghToken}`,
      },
    });

    return await resp.json() as IGitHubIssueLabel[];
  }
}
