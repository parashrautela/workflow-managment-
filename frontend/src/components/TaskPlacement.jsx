import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

export function TaskPlacement({ value, onChange, tasks = [], allowKeep = false, allowFirst = false, sequential = true }) {
  return <fieldset className="space-y-2">
    <legend className="text-xs font-medium">After which task?</legend>
    <NativeSelect aria-label="Task placement" className="w-full" value={value.type} onChange={(event) => onChange({ type: event.target.value, taskId: value.taskId || tasks[0]?.id || '', startDate: value.startDate || new Date().toLocaleDateString('en-CA') })}>
      {allowKeep && <NativeSelectOption value="keep">Keep current start and dependencies</NativeSelectOption>}
      <NativeSelectOption value="after">After another task</NativeSelectOption>
      {!sequential && <NativeSelectOption value="parallel">In parallel with another task</NativeSelectOption>}
      {!sequential && <NativeSelectOption value="date">On a specific date</NativeSelectOption>}
    </NativeSelect>
    {['after', 'parallel'].includes(value.type) && <label className="block space-y-1"><span className="text-xs">Reference task</span><NativeSelect aria-label="Reference task" className="w-full" value={value.taskId || ''} onChange={(event) => onChange({ ...value, taskId: event.target.value })}>
      <NativeSelectOption value="">{allowFirst && value.type === 'after' ? 'First task in this work type' : 'Choose a task…'}</NativeSelectOption>
      {tasks.map((task) => <NativeSelectOption key={task.id} value={task.id}>{task.title}</NativeSelectOption>)}
    </NativeSelect></label>}
    {value.type === 'date' && <label className="block space-y-1"><span className="text-xs">Start date</span><Input aria-label="Task start date" type="date" value={value.startDate || ''} onChange={(event) => onChange({ ...value, startDate: event.target.value })} /></label>}
    <p className="text-xs text-muted-foreground">{value.type === 'parallel' ? 'Both tasks start together. The existing task keeps its dates.' : value.type === 'after' ? 'This task waits for the reference task. The preview shows any later work that must move.' : value.type === 'date' ? 'This task starts independently on the selected date.' : 'Existing dependencies are preserved.'}</p>
  </fieldset>;
}
