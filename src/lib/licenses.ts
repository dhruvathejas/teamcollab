export type License = {
  /** SPDX identifier stored on the team. */
  id: string;
  name: string;
  summary: string;
  url: string;
};

export const LICENSES: License[] = [
  {
    id: "MIT",
    name: "MIT License",
    summary: "Short and permissive: anyone can reuse the work as long as they keep the copyright notice.",
    url: "https://choosealicense.com/licenses/mit/",
  },
  {
    id: "Apache-2.0",
    name: "Apache License 2.0",
    summary: "Permissive, with an explicit patent grant and a requirement to note changes.",
    url: "https://choosealicense.com/licenses/apache-2.0/",
  },
  {
    id: "GPL-3.0-only",
    name: "GNU GPL v3",
    summary: "Copyleft: derivative works must be released under the same license with source code.",
    url: "https://choosealicense.com/licenses/gpl-3.0/",
  },
  {
    id: "AGPL-3.0-only",
    name: "GNU AGPL v3",
    summary: "Like GPL v3, but also covers software used over a network.",
    url: "https://choosealicense.com/licenses/agpl-3.0/",
  },
  {
    id: "MPL-2.0",
    name: "Mozilla Public License 2.0",
    summary: "Weak copyleft at the file level: changed files stay open, the rest can be combined freely.",
    url: "https://choosealicense.com/licenses/mpl-2.0/",
  },
  {
    id: "BSD-3-Clause",
    name: "BSD 3-Clause License",
    summary: "Permissive, and forbids using the authors' names to endorse derived products.",
    url: "https://choosealicense.com/licenses/bsd-3-clause/",
  },
  {
    id: "CC-BY-4.0",
    name: "Creative Commons Attribution 4.0",
    summary: "For non-code work (docs, art, data): reuse freely with attribution.",
    url: "https://choosealicense.com/licenses/cc-by-4.0/",
  },
  {
    id: "CC-BY-SA-4.0",
    name: "Creative Commons Attribution-ShareAlike 4.0",
    summary: "For non-code work: reuse with attribution, and share adaptations under the same terms.",
    url: "https://choosealicense.com/licenses/cc-by-sa-4.0/",
  },
  {
    id: "Unlicense",
    name: "The Unlicense",
    summary: "Dedicates the work to the public domain.",
    url: "https://choosealicense.com/licenses/unlicense/",
  },
  {
    id: "UNLICENSED",
    name: "All rights reserved",
    summary: "No license is granted: others may view the files but not reuse them.",
    url: "https://choosealicense.com/no-permission/",
  },
];

const byId = new Map(LICENSES.map((l) => [l.id, l]));

export function isLicenseId(id: string): boolean {
  return byId.has(id);
}

export function getLicense(id: string): License {
  return (
    byId.get(id) ?? { id, name: id, summary: "", url: "https://spdx.org/licenses/" }
  );
}
