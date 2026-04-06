/**
 * 钉钉机器人 Extension
 * 
 * 功能：
 * - 自动连接钉钉Stream，接收群消息
 * - 注册 dingtalk_send 工具，让LLM可以发送钉钉消息
 * 
 * 配置环境变量：
 * - DINGTALK_CLIENT_ID: 钉钉应用Client ID
 * - DINGTALK_CLIENT_SECRET: 钉钉应用Client Secret
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// 钉钉Stream客户端类型（动态导入）
type DWClient = any;

// 全局状态
let client: DWClient | null = null;
let isConnected = false;
let messageCallback: ((msg: { text: string; senderNick: string; sessionWebhook: string }) => void) | null = null;
let currentSessionWebhook: string | null = null;  // 当前消息的sessionWebhook
let autoReplyEnabled = true;  // 是否启用自动回复

// 初始化钉钉客户端
async function initDingTalkClient(api: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const clientId = process.env.DINGTALK_CLIENT_ID;
  const clientSecret = process.env.DINGTALK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    ctx.ui.notify("钉钉未配置：请设置 DINGTALK_CLIENT_ID 和 DINGTALK_CLIENT_SECRET 环境变量", "warning");
    return;
  }

  if (client && isConnected) {
    return;
  }

  try {
    // 动态导入dingtalk-stream
    const { DWClient: DingTalkClient } = await import("dingtalk-stream");
    
    client = new DingTalkClient({
      clientId,
      clientSecret,
    });

    // 监听机器人消息
    client.registerCallbackListener("/v1.0/im/bot/messages/get", async (event: any) => {
      try {
        const data = JSON.parse(event.data);
        const messageId = event.headers.messageId;
        
        // 只处理文本消息
        if (data.msgtype !== "text") {
          client.socketCallBackResponse(messageId, { status: "SUCCESS" });
          return { status: "SUCCESS" };
        }

        const text = data.text?.content;
        const senderNick = data.senderNick;
        const sessionWebhook = data.sessionWebhook;

        // 先响应服务器
        client.socketCallBackResponse(messageId, { status: "SUCCESS" });

        // 如果有回调，通知用户
        if (text && messageCallback) {
          messageCallback({ text, senderNick, sessionWebhook });
        }

        return { status: "SUCCESS" };
      } catch (err) {
        console.error("[钉钉] 处理消息失败:", err);
        return { status: "SUCCESS" };
      }
    });

    await client.connect();
    isConnected = true;
    ctx.ui.notify("钉钉已连接", "info");
    ctx.ui.setStatus("dingtalk", "钉钉: 已连接");
  } catch (err: any) {
    ctx.ui.notify(`钉钉连接失败: ${err.message}`, "error");
    ctx.ui.setStatus("dingtalk", "钉钉: 连接失败");
  }
}

// 发送消息到钉钉
async function sendToDingTalk(sessionWebhook: string, content: string): Promise<boolean> {
  if (!sessionWebhook) {
    return false;
  }

  try {
    const response = await fetch(sessionWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msgtype: "text",
        text: { content },
      }),
    });
    const result = await response.json();
    return result.errcode === 0;
  } catch {
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  // 注册发送消息工具
  pi.registerTool({
    name: "dingtalk_send",
    label: "钉钉发送",
    description: "发送消息到钉钉群。需要提供sessionWebhook（从收到的消息中获取）。",
    promptSnippet: "发送消息到钉钉群",
    parameters: Type.Object({
      sessionWebhook: Type.String({ description: "钉钉消息的sessionWebhook地址" }),
      content: Type.String({ description: "要发送的消息内容" }),
    }),
    async execute(_toolCallId, params) {
      const success = await sendToDingTalk(params.sessionWebhook, params.content);
      return {
        content: [{
          type: "text",
          text: success ? "消息发送成功" : "消息发送失败",
        }],
        details: { success },
      };
    },
  });

  // 注册检查连接状态工具
  pi.registerTool({
    name: "dingtalk_status",
    label: "钉钉状态",
    description: "检查钉钉连接状态",
    promptSnippet: "检查钉钉连接状态",
    parameters: Type.Object({}),
    async execute() {
      return {
        content: [{
          type: "text",
          text: isConnected ? "钉钉已连接" : "钉钉未连接",
        }],
        details: { connected: isConnected },
      };
    },
  });

  // 注册配置命令
  pi.registerCommand("dingtalk-setup", {
    description: "配置钉钉连接（设置环境变量后重启pi）",
    handler: async (_args, ctx) => {
      const clientId = process.env.DINGTALK_CLIENT_ID;
      const clientSecret = process.env.DINGTALK_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        ctx.ui.notify(
          "请设置环境变量后重启pi:\n" +
          "  set DINGTALK_CLIENT_ID=your_client_id\n" +
          "  set DINGTALK_CLIENT_SECRET=your_client_secret",
          "warning"
        );
        return;
      }

      ctx.ui.notify("钉钉配置已存在，正在连接...", "info");
      await initDingTalkClient(pi, ctx);
    },
  });

  // 注册自动回复开关命令
  pi.registerCommand("dingtalk-autoreply", {
    description: "开启/关闭钉钉消息自动回复",
    handler: async (_args, ctx) => {
      autoReplyEnabled = !autoReplyEnabled;
      ctx.ui.notify(
        `钉钉自动回复已${autoReplyEnabled ? "开启" : "关闭"}`,
        "info"
      );
      ctx.ui.setStatus("dingtalk", `钉钉: 自动回复${autoReplyEnabled ? "开" : "关"}`);
    },
  });

  // 会话开始时自动连接
  pi.on("session_start", async (_event, ctx) => {
    // 检查配置
    const clientId = process.env.DINGTALK_CLIENT_ID;
    const clientSecret = process.env.DINGTALK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      ctx.ui.setStatus("dingtalk", "钉钉: 未配置");
      return;
    }

    // 延迟连接，避免阻塞启动
    setTimeout(() => initDingTalkClient(pi, ctx), 1000);
  });

  // 会话关闭时断开连接
  pi.on("session_shutdown", async () => {
    if (client) {
      try {
        client.disconnect();
      } catch {}
      client = null;
      isConnected = false;
    }
  });

  // 设置消息回调（用于通知用户并自动处理）
  messageCallback = (msg) => {
    // 保存当前消息的sessionWebhook
    currentSessionWebhook = msg.sessionWebhook;
    
    // 发送用户消息，触发LLM自动处理和回复
    pi.sendUserMessage(`[钉钉消息] ${msg.senderNick}: ${msg.text}`);
  };

  // 监听agent结束事件，自动发送回复到钉钉
  pi.on("agent_end", async (event, ctx) => {
    // 只有在有sessionWebhook且启用了自动回复时才发送
    if (!currentSessionWebhook || !autoReplyEnabled) {
      return;
    }

    // 获取最新的助手消息
    const entries = ctx.sessionManager.getBranch();
    const lastAssistantMessage = [...entries]
      .reverse()
      .find(e => e.type === "message" && e.message.role === "assistant");

    if (!lastAssistantMessage || lastAssistantMessage.type !== "message") {
      return;
    }

    const content = lastAssistantMessage.message.content;
    if (!content || content.length === 0) {
      return;
    }

    // 提取文本内容
    const textContent = content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    if (!textContent) {
      return;
    }

    // 截断过长的消息
    const replyText = textContent.length > 2000
      ? textContent.slice(0, 1997) + "..."
      : textContent;

    // 发送到钉钉
    const success = await sendToDingTalk(currentSessionWebhook, replyText);
    
    if (success) {
      ctx.ui.setStatus("dingtalk", "钉钉: 已回复");
    } else {
      ctx.ui.setStatus("dingtalk", "钉钉: 回复失败");
    }

    // 清除sessionWebhook
    currentSessionWebhook = null;
  });
}
