import { TaskDetailScreen } from "@/components/tasks/task-detail-screen";

export default async function SwitchTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TaskDetailScreen id={id} lane="switch" />;
}
