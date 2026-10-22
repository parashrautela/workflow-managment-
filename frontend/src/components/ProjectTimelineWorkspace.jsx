import { ProjectTimeline } from '@/components/ProjectTimeline';

// The timeline always shows the project's own tasks. Founder sheet plans (such as INTERIOR 1) are real
// workflows in the bot now, so a project started with one has those tasks in the Google Sheet and they can be edited here.
export function ProjectTimelineWorkspace({ tasks = [], stages = [], members = [], spaces = [], projectId, namespace = 'founder', telegramLinked = false, onOpenTask, onSchedulePreview, onScheduleApply, onPlanChanged }) {
  return <section className="iksha-sheet-workspace">
    <ProjectTimeline tasks={tasks} stages={stages} members={members} spaces={spaces} projectId={projectId} namespace={namespace} telegramLinked={telegramLinked} onOpenTask={onOpenTask} onSchedulePreview={onSchedulePreview} onScheduleApply={onScheduleApply} onPlanChanged={onPlanChanged} />
  </section>;
}
