"use client";

import { useState } from "react";
import { LICENSES, getLicense } from "@/lib/licenses";
import { inputStyles } from "../ui";

export function LicenseSelect({ defaultValue = "MIT", disabled }: { defaultValue?: string; disabled?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const license = getLicense(value);
  return (
    <>
      <select
        id="license"
        name="license"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        className={inputStyles}
      >
        {LICENSES.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      <p className="text-xs text-muted">
        {license.summary}{" "}
        <a href={license.url} target="_blank" rel="noreferrer" className="text-accent underline">Learn more</a>
      </p>
    </>
  );
}
