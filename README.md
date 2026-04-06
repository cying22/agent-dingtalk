# 钉钉机器人 Extension

让 pi 可以通过钉钉收发消息的 extension。

## 功能

- 🔌 自动连接钉钉 Stream（长连接，无需公网IP）
- 📨 接收钉钉群消息并转发给 pi
- 📤 注册 `dingtalk_send` 工具，让 LLM 可以发送钉钉消息
- 📊 注册 `dingtalk_status` 工具，检查连接状态

## 安装

Extension 已安装在 `~/.pi/agent/extensions/dingtalk/`

安装依赖：
```bash
cd ~/.pi/agent/extensions/dingtalk
npm install
```

## 配置

设置环境变量（在系统环境变量或 .env 文件中）：

```bash
# Windows
set DINGTALK_CLIENT_ID=your_client_id
set DINGTALK_CLIENT_SECRET=your_client_secret

# 或在 PowerShell 中
$env:DINGTALK_CLIENT_ID="your_client_id"
$env:DINGTALK_CLIENT_SECRET="your_client_secret"
```

获取凭证：
1. 登录 [钉钉开放平台](https://open-dev.dingtalk.com)
2. 创建企业内部应用
3. 添加机器人能力（选择 Stream 模式）
4. 在「凭证与基础信息」获取 Client ID 和 Client Secret

## 使用

### 重启 pi

配置环境变量后，重启 pi 使其生效：
```bash
pi
```

Extension 会自动：
1. 连接钉钉 Stream
2. 显示连接状态（在状态栏）
3. 接收并转发钉钉群消息

### LLM 工具

Extension 注册了两个工具：

#### dingtalk_send
发送消息到钉钉群。

```
参数：
- sessionWebhook: 钉钉消息的 sessionWebhook 地址（从收到的消息中获取）
- content: 要发送的消息内容
```

LLM 收到钉钉消息时，会自动获取 sessionWebhook，并使用此工具回复。

#### dingtalk_status
检查钉钉连接状态。

```
参数：无
返回：连接状态（已连接/未连接）
```

### 命令

#### /dingtalk-setup
配置钉钉连接。

## 工作流程

```
1. pi 启动，extension 自动连接钉钉
2. 用户在钉钉群 @机器人 发送消息
3. 钉钉推送到 pi
4. pi 处理消息，LLM 使用 dingtalk_send 工具回复
5. 回复发送到钉钉群
```

## 其他 agent 使用

其他 agent 只需要：
1. 安装这个 extension
2. 配置相同的环境变量
3. 重启 pi

即可使用钉钉通信功能。

## 文件结构

```
~/.pi/agent/extensions/dingtalk/
├── index.ts      # Extension 主文件
├── package.json  # 依赖配置
└── README.md     # 本文档
```

## 注意事项

- 需要钉钉企业内部应用（个人测试可以用）
- 机器人需要加入群聊才能收发消息
- sessionWebhook 有有效期，过期后需要新的消息才能获取新的 webhook

## 许可证

MIT
