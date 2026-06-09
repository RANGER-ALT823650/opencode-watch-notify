import { execFileSync } from "node:child_process"

const NOTIFY_SCRIPT = process.env.OPENCODE_NOTIFY_SCRIPT || "/opt/opencode-watch-notify/codex-watch-notify.sh"
const IOS_SESSION_TITLE = process.env.OPENCODE_IOS_SESSION_TITLE || "iOS Chat"
const DUPLICATE_WINDOW_MS = 5000
const lastNotificationBySession = new Map()
const notifiedPermissions = new Set()

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

const runNotifier = async ({
  client,
  eventName,
  details,
  notificationTitle,
  sessionID,
  callerTTY = processTTY,
}) => {
  try {
    const process = Bun.spawn(
      [
        NOTIFY_SCRIPT,
        "opencode",
        eventName,
        details,
        notificationTitle,
        callerTTY,
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
        message: "Failed to create watch reminder",
        extra: {
          eventName,
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
        message: "Failed to run watch notifier",
        extra: {
          eventName,
          sessionID,
          error: String(error),
        },
      },
    })
  }
}

export const WatchNotificationPlugin = async ({ client, directory }) => {
  return {
    event: async ({ event }) => {
      // OpenCode v2 emits permission.asked; keep the old event for compatibility.
      if (
        event.type === "permission.asked" ||
        event.type === "permission.updated"
      ) {
        const permission = event.properties
        const permissionID = permission.id ?? permission.requestID
        if (permissionID && notifiedPermissions.has(permissionID)) return
        if (permissionID) notifiedPermissions.add(permissionID)

        const rawPatterns = permission.patterns ?? permission.pattern
        const pattern = Array.isArray(rawPatterns)
          ? rawPatterns.join(", ")
          : (rawPatterns ?? "")
        const permissionType = permission.permission ?? permission.type ?? "unknown"
        const details = [
          directory,
          `Session: ${permission.sessionID}`,
          `Permission: ${permissionType}`,
          pattern ? `Pattern: ${pattern}` : "",
          permission.title ? `Title: ${permission.title}` : "",
        ].filter(Boolean).join("\n")

        await runNotifier({
          client,
          eventName: "permission-request",
          details,
          notificationTitle: "Opencode: 需要权限批准",
          sessionID: permission.sessionID,
          callerTTY: "",
        })
        return
      }

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

      await runNotifier({
        client,
        eventName: "task-completed",
        details,
        notificationTitle,
        sessionID,
      })
    },
  }
}
