export function LocationProjectPicker({ projects, selected, onChange }) {
  const groups = new Map();
  for (const project of projects) {
    const label = project.location?.trim() || 'Location not set',
      key = label.toLowerCase();
    if (!groups.has(key)) groups.set(key, { label, projects: [] });
    groups.get(key).projects.push(project);
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...groups.values()]
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((group) => {
          const all = group.projects.every((project) => selected.includes(project.id));
          return (
            <fieldset key={group.label} className="space-y-2 rounded-lg border p-3">
              <legend className="text-sm font-semibold">{group.label}</legend>
              <label className="flex gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...new Set([...selected, ...group.projects.map((row) => row.id)])]
                        : selected.filter((id) => !group.projects.some((row) => row.id === id)),
                    )
                  }
                />
                Select this city
              </label>
              {group.projects.map((project) => (
                <label key={project.id} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(project.id)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...selected, project.id]
                          : selected.filter((id) => id !== project.id),
                      )
                    }
                  />
                  {project.name}
                </label>
              ))}
            </fieldset>
          );
        })}
    </div>
  );
}
