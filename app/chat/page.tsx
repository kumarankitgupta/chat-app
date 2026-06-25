import { redirect } from "next/navigation";
import ChatRoom from "@/components/ChatRoom";
import { isAuthenticated } from "@/lib/auth";
import ChatSuspendedNotice from "@/components/ChatSuspendedNotice";
import { getChatSuspensionStatus } from "@/lib/chat-suspension";

export default async function ChatPage() {
  if (!(await isAuthenticated())) {
    redirect("/");
  }

  const { isSuspended, suspendedUntil } = await getChatSuspensionStatus();
  if (isSuspended && suspendedUntil) {
    return <ChatSuspendedNotice suspendedUntil={suspendedUntil} />;
  }

  return <ChatRoom />;
}
