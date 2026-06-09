# ⌚ Opencode Watch Notify

> **在 Apple Watch 上接收 AI 任务完成通知** — Opencode 任务跑完，手腕轻轻一震就知道。

---

## 这是什么？

一个 **Opencode 插件** + **macOS 脚本** 的组合。当 Opencode 的任务执行完毕（进入 idle 状态）或等待权限批准时，它会自动在 macOS「提醒事项」中创建一条提醒，通过 iCloud 同步到你的 Apple Watch。

## 适合谁？
苹果生态用户

## 效果： 
你不用一直盯着屏幕，手机会震动，手表会震动，该干嘛干嘛，任务完成自然知道。
当然，如果手机亮屏，那么通知就会在手机上显示，而不是手表上的震动。

---

## 适用场景

- 跑一个长时间的代码重构、批量文件处理、数据分析任务
- Opencode 执行到一半等待目录、命令或工具权限批准
- 切到浏览器查资料、去倒杯咖啡、甚至出门遛一圈
- Opencode 完成后，手表/手机立即震动提醒你回来检查结果

---

## 项目结构

```
opencode-watch-notify/
├── plugin/
│   └── watch-notify.js      ← Opencode 插件（监听完成和权限申请事件）
├── codex-watch-notify.sh    ← 脚本（调用 macOS 提醒事项 API）
└── README.md
```

---

## 安装步骤

### 1. 安装插件

将 `plugin/watch-notify.js` **复制或软链接** 到 Opencode 的插件目录：

```bash
# 创建插件目录（如果还没有）
mkdir -p ~/.config/opencode/plugins

# 复制插件文件
cp plugin/watch-notify.js ~/.config/opencode/plugins/
```

### 2. 安装脚本

将 `codex-watch-notify.sh` 放到一个固定位置，例如：

```bash
cp codex-watch-notify.sh /opt/opencode-watch-notify/
chmod +x /opt/opencode-watch-notify/codex-watch-notify.sh
```

### 3. 配置环境变量（可选）

在 Opencode 的配置或 shell 配置文件中设置：

```bash
# 通知脚本路径（默认：/opt/opencode-watch-notify/codex-watch-notify.sh）
export OPENCODE_NOTIFY_SCRIPT="/opt/opencode-watch-notify/codex-watch-notify.sh"

# 日志文件路径（默认：/tmp/opencode-watch-notify.log）
export OPENCODE_NOTIFY_LOG="/tmp/opencode-watch-notify.log"
```

### 4. （可选）在 Opencode 配置中启用插件

编辑 `~/.config/opencode/opencode.json`，添加：

```json
{
  "plugins": {
    "watch-notify": {}
  }
}
```

---

## 工作原理

1. **Opencode 任务完成或申请权限** → 产生 idle / permission 事件
2. `watch-notify.js` 插件检测到对应事件
3. 调用 `codex-watch-notify.sh` 脚本
4. 脚本通过 macOS `osascript` 在「提醒事项」中创建一条提醒
5. iCloud 自动同步 → **Apple Watch / iPhone 立即弹出通知**

### 智能防打扰

如果你正在 Opencode 所在的终端窗口（Terminal）中活动，任务完成提醒会被抑制，避免重复打扰；权限申请提醒始终发送，因为忽略它会使任务一直等待。

**例外：屏幕已关闭时** — 当 Mac 未进入睡眠、但屏幕亮度已调到最低（背光关闭）时，即使终端窗口在前台，依然会发送手表震动提醒。这适用于你合上笔记本盖子或手动将亮度调到最低、人已离开电脑的场景。

---

## 验证是否生效

执行测试命令，检查日志：

```bash
# 直接手动测试脚本
/opt/opencode-watch-notify/codex-watch-notify.sh opencode test "测试消息" "测试标题" ""

# 查看日志
tail -f /tmp/opencode-watch-notify.log
```

如果看到 `result=created`，说明提醒已成功创建。打开 macOS「提醒事项」App 或 Apple Watch 即可看到。

---

## 常见问题

**Q：一定要用 Apple Watch 吗？**
不是。提醒事项会同步到所有 iCloud 设备：iPhone、iPad、Mac 都会收到通知。

**Q：脚本里提到的 Codex 是什么？**
这是一个遗留的名称。脚本同时兼容 Opencode 和早期版本的 Codex。如果你只用 Opencode，可以忽略。

---

## 许可证

MIT
