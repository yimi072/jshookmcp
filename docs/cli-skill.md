# jshook CLI Skill Guide

Agent 使用指南：何时以及如何使用 jshook CLI 的各个功能。

## Output Contract（输出契约）

jshook CLI 遵循 **agent-friendly** 输出规范，便于程序化解析：

| 输出流 | 内容 | 格式 |
|--------|------|------|
| **stdout** | 结构化数据 | JSON（单行） |
| **stderr** | 人类可读日志 | 文本，前缀 `[jshook]` |
| **Exit code** | 0 = 成功，1 = 错误 | - |

### Success Response
```json
{"ok": true, "data": {...}, "meta": {"command": "stego scan", "elapsedMs": 123}}
```

### Error Response
```json
{"ok": false, "code": "E_NOT_FOUND", "message": "Adapter not found", "context": {...}}
```

**错误码前缀含义：**
- `E_USAGE` - 参数使用错误
- `E_NOT_FOUND` - 资源未找到
- `E_INVALID_JSON` - JSON 解析失败
- `E_UPDATE_FAILED` - 更新操作失败
- `E_UNKNOWN_*` - 未知命令/子命令
- `E_RUNTIME` - 运行时错误
- `E_FATAL` - 致命错误

---

## 功能选择决策树

```
需要操作浏览器？
├── 是 → 浏览器是否已在运行？
│   ├── 是 → 使用 eval/snapshot/click/fill/hover/open/tabs
│   └── 否 → 先启动 TMWebDriver (scripts/final/start_tmwebdriver.py)
├── 否 → 需要获取网站数据？
│   ├── 是 → 使用 site run/list/search
│   └── 否 → 分析本地文件？
│       ├── 图片/媒体 → stego (隐写分析)
│       ├── 网络抓包 → pcap (流量分析)
│       ├── 可疑二进制 → yara (模式扫描)
│       └── CTF/pwn → pwn (二进制利用)
```

---

## 1. Browser Automation（浏览器自动化）

**何时使用：** 需要与浏览器页面交互、执行 JS、获取 DOM 快照。

**前置条件：** TMWebDriver 必须正在运行（Chrome 扩展已连接）。

| 场景 | 命令 | 示例 |
|------|------|------|
| 执行 JS | `jshook eval "document.title"` | 获取页面标题、执行任意脚本 |
| 获取可交互元素快照 | `jshook snapshot` | AI 通过 @ref 号操作元素 |
| 点击元素 | `jshook click 3` | 点击 @ref=3 的元素 |
| 填写输入 | `jshook fill 5 "hello"` | 在 @ref=5 输入框填入文本 |
| 悬停元素 | `jshook hover 2` | 触发 mouseover 事件 |
| 页面导航 | `jshook open https://example.com` | 在当前标签页打开 URL |
| 新标签页 | `jshook open-new https://example.com` | 在新标签页打开 |
| 列出标签页 | `jshook tabs` | 查看所有连接的标签页 |
| 截图 | `jshook screenshot --path shot.png` | 保存页面截图 |
| 获取 Cookie | `jshook cookies` | 导出当前页面 cookies |

**典型工作流：**
```bash
# 1. 获取页面结构
jshook snapshot --max-depth 10
# 2. 找到搜索框的 @ref（假设是 #3）
# 3. 填入搜索词
jshook fill 3 "search query"
# 4. 点击搜索按钮（假设是 #4）
jshook click 4
# 5. 获取结果
jshook eval "document.querySelectorAll('.result').length"
```

---

## 2. Site Adapters（站点适配器）

**何时使用：** 需要从特定网站提取结构化数据（无需编写自定义脚本）。

**优势：** 126 个预置适配器覆盖 36+ 平台，自动使用当前浏览器登录态。

| 场景 | 命令 | 示例 |
|------|------|------|
| 查看可用适配器 | `jshook site list` | 列出所有适配器 |
| 搜索适配器 | `jshook site search twitter` | 按关键词搜索 |
| 查看适配器详情 | `jshook site info twitter/me` | 查看参数和描述 |
| 运行适配器 | `jshook site run reddit/me --json` | 提取当前用户 Reddit 信息 |
| 带参数运行 | `jshook site run twitter/search --args '{"query":"AI"}'` | 搜索推文 |
| 更新适配器 | `jshook site update` | 从 GitHub 同步最新适配器 |

**常用适配器：**
- `twitter/me`, `twitter/search`, `twitter/tweet` - Twitter/X 数据
- `reddit/me`, `reddit/subreddit` - Reddit 内容
- `github/profile`, `github/repo` - GitHub 信息
- `bilibili/user`, `bilibili/video` - B站数据
- `zhihu/profile`, `zhihu/answers` - 知乎信息
- `youtube/video`, `youtube/channel` - YouTube 数据

---

## 3. Steganography（隐写分析）

**何时使用：** 分析图片/媒体文件是否藏有隐藏信息（CTF forensics 必备）。

| 场景 | 命令 | 检测/提取能力 |
|------|------|---------------|
| 全面扫描 | `jshook stego scan <file>` | 文件格式、追加数据、熵值、可疑字符串、embedded 签名 |
| LSB 提取 | `jshook stego lsb <file> --bit-plane 0 --channel rgb` | 从 RGB 通道提取最低有效位 |
| PNG 块分析 | `jshook stego png <file>` | 解析 IHDR/IDAT/IEND 等块，检测异常 chunk |
| EXIF 提取 | `jshook stego exif <file>` | JPEG/PNG 的元数据、评论、JFIF |
| 边框解码 | `jshook stego border <file> --threshold 384` | 从图片边框提取二进制数据 |
| XOR 爆破 | `jshook stego xor <hex> --top-n 10` | 单字节 XOR 密钥爆破 |

**典型工作流：**
```bash
# 1. 先扫描发现异常
jshook stego scan challenge.png
# 2. 发现 appended data → 检查十六进制
# 3. 发现高熵区域 → 尝试 LSB 提取
jshook stego lsb challenge.png --bit-plane 0 --channel rgba
# 4. PNG 文件检查异常块
jshook stego png challenge.png
```

---

## 4. PCAP Analysis（网络流量分析）

**何时使用：** 分析网络抓包文件（CTF forensics、恶意流量检测）。

| 场景 | 命令 | 能力 |
|------|------|------|
| TCP 流重组 | `jshook pcap streams <file> --max-streams 20` | 重组 TCP 会话 |
| 文件提取 | `jshook pcap carve <file> --output-dir ./files` | 从流量中提取文件 |
| DNS 隧道检测 | `jshook pcap dns <file>` | 检测 DNS 隐蔽隧道/数据外传 |
| HTTP 提取 | `jshook pcap http <file> --include-body` | 提取 HTTP 请求/响应 |

**典型工作流：**
```bash
# 1. 先看有哪些 TCP 流
jshook pcap streams capture.pcap
# 2. 提取其中的文件
jshook pcap carve capture.pcap --output-dir extracted/
# 3. 检查是否有 DNS 外传
jshook pcap dns capture.pcap
# 4. 导出 HTTP 内容分析
jshook pcap http capture.pcap --include-body
```

---

## 5. YARA Scan（模式扫描）

**何时使用：** 扫描文件中的恶意模式、创建自定义检测规则。

| 场景 | 命令 | 能力 |
|------|------|------|
| 使用内置规则扫描 | `jshook yara scan <file>` | PE 可疑指标、壳检测、常见恶意软件特征 |
| 使用自定义规则 | `jshook yara scan <file> --rule-file rules.yar` | 应用自定义 YARA 规则 |
| 查看内置规则 | `jshook yara rules --category all` | 列出所有可用规则 |
| 创建规则 | `jshook yara create-rule myrule --hex "89 50" --ascii "MZ"` | 生成 YARA 规则模板 |

**典型工作流：**
```bash
# 1. 先用内置规则扫描
jshook yara scan suspicious.exe
# 2. 查看有哪些规则可用
jshook yara rules --category pe
# 3. 为特定 CTF flag 格式创建规则
jshook yara create-rule ctf_flag --ascii "flag{" --hex "66 6c 61 67"
# 4. 使用新规则扫描
jshook yara scan challenge.bin --rule-file ctf_flag.yar
```

---

## 6. Pwn Tools（二进制利用）

**何时使用：** CTF pwn 题目、二进制安全分析、ROP 链构建。

| 场景 | 命令 | 能力 |
|------|------|------|
| 保护检查 | `jshook pwn checksec <binary>` | 检查 NX、PIE、Canary、RELRO、ASLR |
| ELF 信息 | `jshook pwn elf <binary>` | 解析 ELF 头、程序头、节区、动态段 |
| 生成 pattern | `jshook pwn pattern create --length 256` | 生成 De Bruijn 序列 |
| 查找 offset | `jshook pwn pattern offset 0x41414141` | 在 pattern 中查找偏移 |
| Shellcode 分析 | `jshook pwn shellcode <hex>` | 反汇编、分析 shellcode |
| ROP gadget 搜索 | `jshook pwn gadgets <binary> --pattern "pop rdi"` | 搜索可用 gadget |
| ROP 链构建 | `jshook pwn rop <binary> --action exec_shell` | 自动构建基础 ROP 链 |

**典型工作流（栈溢出）：**
```bash
# 1. 检查二进制保护
jshook pwn checksec vulnerable
# 2. 生成 pattern 确定偏移
jshook pwn pattern create --length 300
# 3. 运行程序，输入 pattern，记录崩溃地址
# 4. 计算偏移
jshook pwn pattern offset 0x41414641
# 5. 搜索 pop rdi gadget
jshook pwn gadgets vulnerable --pattern "pop rdi"
# 6. 构建 ROP 链
jshook pwn rop vulnerable --action exec_shell
```

---

## 7. Environment Diagnostics（环境诊断）

**何时使用：** 排查 jshook 环境问题、检查依赖状态。

```bash
jshook doctor
```

输出包含：
- Node.js 版本检查
- 依赖安装状态
- TMWebDriver 连接健康
- MCP Bridge 状态

---

## Quick Reference Card

| 任务类型 | 首选命令 | 需要浏览器 |
|----------|----------|------------|
| 页面自动化 | `jshook eval/click/fill/snapshot` | 是 |
| 抓取网站数据 | `jshook site run <adapter>` | 是 |
| 图片隐写分析 | `jshook stego scan/lsb/png` | 否 |
| 流量分析 | `jshook pcap streams/carve` | 否 |
| 恶意文件扫描 | `jshook yara scan` | 否 |
| CTF Pwn | `jshook pwn checksec/pattern/rop` | 否 |
| 环境检查 | `jshook doctor` | 否 |
