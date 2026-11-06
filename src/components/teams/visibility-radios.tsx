export function VisibilityRadios({ defaultValue = "PUBLIC", disabled }: { defaultValue?: string; disabled?: boolean }) {
  const options = [
    { value: "PUBLIC", label: "Public", hint: "Anyone can see the team and its files, and request to join." },
    { value: "PRIVATE", label: "Private", hint: "Only members (and people you invite) can see it. Joining is by invite only." },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 block text-sm font-medium">Visibility</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-checked:border-accent has-checked:bg-accent-soft"
        >
          <input
            type="radio"
            name="visibility"
            value={o.value}
            defaultChecked={defaultValue === o.value}
            disabled={disabled}
            className="mt-1 accent-accent"
          />
          <span>
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-xs text-muted">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
