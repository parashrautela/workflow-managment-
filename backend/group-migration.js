// Only an explicit old -> new Telegram migration joins group identities.
export function reconcileGroupMigration(state, fromId, toId) {
  const from=String(fromId),to=String(toId);
  if(!/^-\d+$/.test(from) || !/^-100\d+$/.test(to) || from===to)throw new Error('Invalid Telegram group migration.');
  const recorded=state.telegramMigrations.find(row=>row.from===from);
  if(recorded && recorded.to!==to)throw new Error('Conflicting group migration target.');
  const old=state.projects.find(row=>row.telegramGroupChatId===from),current=state.projects.find(row=>row.telegramGroupChatId===to);
  const hasWork=project=>project && (!project.telegramSetupPending || project.workflowStartedAt || project.telegramProjectId);
  if(old && current && hasWork(old) && hasWork(current))throw new Error('Both group IDs have configured projects. Review before merging.');
  const canonical=hasWork(old)?old:(current || old),duplicate=canonical===old?current:old;
  if(canonical){
    if(duplicate){
      canonical.members ||= [];
      for(const member of duplicate.members || [])if(!canonical.members.some(row=>row.employeeId===member.employeeId || row.id===member.id))canonical.members.push(member);
      // Keep every project relation while folding the empty setup shell into its successor.
      for(const rows of Object.values(state))if(Array.isArray(rows))for(const row of rows)if(row.projectId===duplicate.id)row.projectId=canonical.id;
      state.projects=state.projects.filter(row=>row!==duplicate);
    }
    canonical.telegramGroupChatId=to;
  }
  const oldGroup=state.telegramGroups.find(row=>row.groupChatId===from),newGroup=state.telegramGroups.find(row=>row.groupChatId===to);
  if(oldGroup && !newGroup)oldGroup.groupChatId=to;
  else if(oldGroup && newGroup)state.telegramGroups=state.telegramGroups.filter(row=>row!==oldGroup);
  if(!recorded)state.telegramMigrations.push({from,to,projectId:canonical?.id || '',previousProject:duplicate?structuredClone(duplicate):null,previousGroup:oldGroup?structuredClone(oldGroup):null,at:new Date().toISOString()});
  return canonical;
}
