import { execFileSync } from "node:child_process"

const NOTIFY_SCRIPT = process.env.OPENCODE_NOTIFY_SCRIPT || "/opt/opencode-watch-notify/codex-watch-notify.sh"
const IOS_SESSION_TITLE = process.env.OPENCODE_IOS_SESSION_TITLE || "iOS Chat"
const DUPLICATE_WINDOW_MS = 5000
const lastNotificationBySession = new Map()

const processTTY = (() => {
  try {
    const tty = execFileSync(
      "/bin/ps",
      ["-o", "tty=", "-p", String(process.pid)],
      { encoding: "utf8" },
    ).trim()
    return tty && tty !== "??" ? `/dev/${tty}` : ""
  } catch {
    return ""
  }
})()

const formatNotificationTitle = (title) => {
  const normalized = title?.replace(/\s+/g, " ").trim()
  if (!normalized || normalized.startsWith("New session -")) {
    return "Opencode: 任务已完成"
  }
  return `Opencode: ${normalized.slice(0, 100)}`
}

export const WatchNotificationPlugin = async ({ client, directory }) => {
  return {
    event: async ({ event }) => {
      const isIdleEvent =
        event.type === "session.idle" ||
        (event.type === "session.status" && event.properties.status.type === "idle")

      if (!isIdleEvent) return

      const sessionID = event.properties.sessionID
      const now = Date.now()
      const lastNotification = lastNotificationBySession.get(sessionID) ?? 0
      if (now - lastNotification < DUPLICATE_WINDOW_MS) return
      lastNotificationBySession.set(sessionID, now)

      const details = `${directory}\nSession: ${sessionID}`
      let notificationTitle = "Opencode: 任务已完成"

      try {
        const response = await client.session.get({
          path: { id: sessionID },
          query: { directory },
        })
        const session = response.data ?? response

        if (session?.title === IOS_SESSION_TITLE) return

        notificationTitle = formatNotificationTitle(session?.title)
      } catch {
        // A missing title should not suppress the completion notification.
      }

      try {
        const process = Bun.spawn(
          [
            NOTIFY_SCRIPT,
            "opencode",
            "task-completed",
            details,
            notificationTitle,
            processTTY,
          ],
          {
            stdout: "ignore",
            stderr: "pipe",
          },
        )
        const exitCode = await process.exited
        if (exitCode === 0) return

        const stderr = await new Response(process.stderr).text()
        await client.app.log({
          body: {
            service: "watch-notify",
            level: "error",
            message: "Failed to create completion reminder",
            extra: {
              sessionID,
              exitCode,
              stderr,
            },
          },
        })
      } catch (error) {
        await client.app.log({
          body: {
            service: "watch-notify",
            level: "error",
            message: "Failed to run completion notifier",
            extra: {
              sessionID,
              error: String(error),
            },
          },
        })
      }
    },
  }
}
