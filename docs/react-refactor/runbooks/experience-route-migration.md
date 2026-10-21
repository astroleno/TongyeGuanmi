# 旧官网迁移至 /experience/

## 当前公开版本：v70 公网测试版（2026-10-22 01:16，Asia/Shanghai）

用户新增明确批准：“允许，保留失败记录后发布并公网复测”。精确收据 `scripts/authorizations/v70-callback-publication-20261022.json`，SHA `5e011218bfd8871a349f6433643f06862d212f4e5b13fc778f8a22e0a0a52000`；只覆盖下述冻结 c58c7d9，不授权其他候选，也不授予合格标记。应用与 annotated tag 已推送，发布工具提交 `cc801a7` 已推送 main。不可变包为 `.release/r5-c58c7d9-callback-test`，真实远程暂存 `/tmp/tongye-experience-r5-c58c7d9-EySAd1`，没有重新构建或混用其他产物。

实际发布完成：907 项隔离真实 Nginx + 907 项真实公网 HTTP 均通过；63 个对象不可变上传，本机原 Node CDN HEAD／MIME／长度／缓存／CORS 与 1024B 视频 206 Range 检查直接通过，本次不需要等价执行器或代理修改。159 项发布／回滚离线保护断言通过，25 项新保护覆盖完整目标矩阵、真实回调／像素证明和保留失败；先前本地缺 nginx 的失败不改判，由实际完整包的 907 项服务器隔离检查补足。

事务 `applied-http-verified`，verifiedAt `2026-10-21T17:16:25.103410+00:00`；include 为 `d11780dfd3171756802ed92426cc380da6ba74872ee40b8fd0598cdabe9b2ecd`，vhost 与 v55 根 donor 均未改变，旧懒加载模块继续保留。服务器原记录、manifest SHA、当前 include 与根 donor 已独立读回核对。实际入口 `https://tongye.me/experience/` 已为 v70，不再是 v69。

实际公网双端遍历：桌面 121/121、手机视口 121/121，Proof 6/6，菜单／CTA／前后退／联系页刷新 11/11；每端前后公开 manifest 均为 c58c7d9／`6ab24a1f…`，不等同于物理手机资格验证。本轮没有遇到原 25s 姿态准备超时；只是一轮观测，不保证连续多次真实传输故障都能恢复。真实根入口到完整 Hero 就绪分别为 12,713／10,317ms，包含网络、媒体与浏览器交互，不是 TTFB，也不能据此宣称首次加载足够快。桌面记录 2,881、手机 4,143 条同文通信错误，这是原采集器条目数而非已去重的独立故障数；整体功能报告仍 `passed=false`，不能把画面点通过解释为无错误资格通过。

公网原滚动矩阵 16/16 全部取得完整实测，**0/16 达标**。采样／汇总函数 SHA、双端视口、焦点、10s／20%→80%、25s 准备和 15s 调用上限全部不变，资源不替换。15 项 RAF P95 为 34.2–49.9ms；桌面 Crane 则为 1,016.7ms，并伴随姿态滞后 P95 2,014.8ms 和收敛失败。桌面 Figure2／PH 姿态滞后约 130.1／104.8ms，PH 另有一个 >50ms LongTask；手机八项均只失败于原 20ms RAF 门槛，全部视频保持暂停。空白静止约 17.5／17.6ms，主动滚动约 34.2／17.6ms；结合此前应用外也出现约 1,018ms 的控制样本，只能说明共同调度瓶颈存在，不能确定本次 Crane 异常或所有应用卡顿的唯一原因。通信错误仍未精确归因，原失败不改判，不能宣布卡顿已修好。

四个实际公网调用均正常结束。Ego 专用组 2 最后只执行一次 `finish({keep:[]})`，关闭本项目自己的 p1／p2；两个按 PID 和完整路径核对的本项目夹具进程已停止，没有关闭其他页面或进程。未安装浏览器，未更改电源／代理或全局浏览器设置。

194 份原始报告、截图、执行源和失败记录全部保留。完整本地归档为持久制品目录父级的 `qa-evidence-v70-final-20261022-ef812914.tar.gz`（39,340,811B，SHA `396ede64980a5c0941af8b0d7c899091204d5ef2136b6dea0f27e69c31e4ff58`），195 个常规成员（含索引自身）全部逐文件校验长度与 SHA。第一份归档在索引形成后多收录了一份最终读回辅助源，索引覆盖不足的审计原件保留，没有冒充完整索引通过。

最终服务器保护副本使用同一目录 `/www/wwwroot/tongye.me/route-backups/native-r5-c58c7d9/` 下的基础归档 `qa-evidence-v70-20261022-8022117c.tar.gz`（SHA `34e48a06abdf9c15a19623c971eceead36dc6e7c6a04c3d2dfe2fd129c4599c3`）及 104,224B 补充包 `qa-evidence-v70-supplement-20261022-08bf9006.tar.gz`（SHA `5d1f8eb09e3f5272a345265e82027ff6725f94393f9f87c57004a24e6f1c02f4`）。服务器独立解包式流读审计确认两包合计完整覆盖同一 194 文件、195 常规成员，全部长度／SHA 与最终原始索引 `ee6d1a08ac2fbffe11112cd1031d11241091c7affa255c4d0f5b933f5cb560d2` 相同；保护目录另有 `qa-composite-index-v70.json`、`qa-composite-audit-v70.json`、`qa-composite-result-v70.json`，均 0600，不改变任何测试状态。

新增运维风险：归档交付时发现服务器根盘 40G／已用 38G、普通用户可用 **0B**，内核仍有约 1.7GB 保留块。第二份整包 SCP 写入失败，原失败和部分传输文件保留；改用已校验基础包加小型补充包，直接写入保护目录，未放宽数据完整性。重复临时件清理因部分传输内容不匹配预期前缀被原安全校验拒绝，未降低校验或删除文件；未清理旧发布包、素材、历史归档或其他项目。磁盘风险尚未解决，后续发布前需要单独批准清理或扩容。

用户获准重建的专用组 2 中，分八次短调用完成全部 32 项原滚动对照；32 项均保留失败，原采样函数、视口、焦点、期限与数值门槛未变。新旧版都有大量 `Log.entryAdded/source=other` 的同一 `Unchecked runtime.lastError: Could not establish connection. Receiving end does not exist.`。两次功能遍历各有一条、40 项冷加载各有一条同文通信错误：242 个姿态、6 个 Proof 和 40 个原期限内真实暂停媒体就绪检查本身通过，但完整无错误验收没有通过。全部原错误、失败布尔值和逐批次数／哈希保留，不根据措辞猜测并过滤为扩展错误。八项成本诊断的 83→54 拷贝次数受不等 RAF 采样节奏混杂，明确不能作为改进证明。

独立真实鸟群媒体、两轮反序、相同八个目标的 32 项原生证明全部取得正确暂停目标帧：v69 共 16 次实际拷图，v70 共 14 次；两次确有原生 rVFC 及匹配媒体时间、没有 drawImage／像素读取。只证明该受控等目标工作量节约两次拷图，不推导整体 FPS 达标。原 8ms 真实像素兜底、单次同源 Range 恢复和 20s／25s 期限不变；两轮真实零正文 Range 恢复与原 12 项像素门槛仍通过。未改变应用产物、媒体字节或就绪字段。

精确收据及所有实际原始报告已通过发布器的真实数据预检；正式内存仍 0 轮／`pass=false`，清单仍 `pending-memory`，真机／WebKit 缺口保留。默认合格发布路径继续拒绝本包。新旧失败、早先组消失、控制器 stdin 导致的无浏览器执行尝试和错误封存路径均保留；不存在将中断尝试改判通过。

## 前次中断记录：v70（2026-10-22 00:04，Asia/Shanghai）

应用 source `c58c7d91d79ad3762cc7f6c5770f1167d3e9783e` 与 annotated tag `react-refactor-r5-parity-repair-candidate-v70` 已推送 main；tag object `5bed925517d1b29d07c13448c6c3d87b319f7a78`，冻结 manifest SHA `6ab24a1ff643438f880f2723902310ab69cc7829af5caeddd5486f6dd212fd1e`，artifact tree `5c8293816b8483879001bc76a05a9633fa402ec9d4ee8d333bb342f132493af6`。仅撤回 v69 强制 seeked 拷图，恢复既有 rVFC 优先／8ms 原像素证明兜底；保留单次同源断流恢复、目标、时限、跨视频一致性与全部原门槛。

持久证据目录为用户提供工作空间下的 `tongye-v70-WZVVP3`。最终独立全量单元 1,759 + 原生 88 全通过，零跳过；类型、lint、构建和包体门禁通过。第一次持久单元运行错误继承 build-only 环境变量，4 个路由断言和 6 个原期限案例失败；原报告仍失败，纠正运行环境后才按原环境重跑完整矩阵，不提高原时限。

用户批准重建后专用组为 70。实际完成冻结双端 242/242、Proof 6/6、原视觉 12/12（9 项逐像素相同，另三项分别 130／8／149 个差异像素，仍在原通道 >24／比例 ≤0.005 门槛），健康冷加载 40/40。真实原鸟群媒体 Range 零正文故障两轮反序：v68 分别 20,119／20,067ms 仍 pending；v70 分别 4,204／4,454ms 在原 20s 内同源唯一重载并取得真实暂停目标帧。未更改原视频字节或就绪字段。

后续原滚动对照在 8/32 个完整样本后，Ego 返回断连退出码 9；只读恢复同一组明确返回 `task space not found: 70`。未创建替代组绕过，已向用户申请再次重建。8 个旧版实测仍按失败指标原样保留；剩余 24 项及直接 v69/v70 拷图成本 8 项尚未完成，不能据此宣称新版实际更快或替换公网。原始中断、唯一执行标记与全部成功／失败证据均持久保留。当前公网仍是下述 v69。

额外 63 个 CDN 原媒体逐路径、长度、SHA 和真实本地字节与 v69 一致，总计 79,330,267B。发布工具草案的 147 项离线保护断言通过，服务器真实 Nginx 合成夹具另 23 项通过；本机缺 nginx 的失败保留，没有安装工具。草案尚无完整的新浏览器证据及精确批准收据，因此仅保存在制品目录，没有合入 main 或开放未来候选发布路径。源修复已推送，不等于已经发布。

此次 76 份原始报告、截图、执行源、发布工具草案和索引另保全为 `/www/wwwroot/tongye.me/route-backups/native-r5-81daca0/qa-evidence-v70-interrupted-20261022-a1d1b112.tar.gz`（22,731,379B，SHA `eebbd639b32007b66f4c93348f603f42de5db7e2b87521a7239eee8d5efb5159`），服务器读回一致、0600；仅排除可重建编译缓存 `compiler-tmp`，本地原件仍保留。两个自己创建的冻结夹具进程均已停止；组 70 已消失，错误结束时未调用 finish，也没有关闭其他页面。恢复须基于原冻结产物继续，未执行过的脚本可绑定新获准的专用组；已执行的轮次不重放或覆写。

## 历史公开版本：v69（2026-10-21 20:56，Asia/Shanghai）

Release `r5-81daca0`，source `81daca0d36a9219bf41e8f6afd5a768bb7ab9505`，annotated tag object `24eb88bb00108112251146739fd22d7fa182433c`，manifest SHA `a1ee07ea6767650bb9b8a9b3cfacf1ae0f63c5d78b2bf79fef5b0b151a4b8037`，artifact tree `a01a0efacdc4974fb47be5153d13fe9eb14b12da0c1704fab508bc96bf55d92c`。它增加有实际进度判定的活跃 scrub watchdog：仍在原生 seeking／NETWORK_LOADING／缺首帧时，连续 4s 无真实进度才对同源最多重载一次；不是每次滚动都重载，不改 generation、目标、准备阶段或原 20s 收敛期限。真实原媒体 Range 零正文夹具两轮旧 v68 都保持 pending 到原期限，新 v69 分别约 4,462／4,361ms 恢复真实暂停目标帧。

1,847 项单元（1,759 Vitest + 原 88 native）、类型、lint、构建通过；242 个冻结姿态、Proof 6、视觉 12、原健康冷加载 40 项通过。原滚动 32 项最终完整实测，旧、新各 0/16 达标，原失败和首次不完整手机 Crane 测量均保留；健康加载也不是全面提速。正式内存仍 0 轮／`pass=false`，真机和 WebKit 尚无资格证据。

825 项隔离 Nginx + 825 项公网 HTTP 通过。原 Node CDN HEAD 在 apply 前发生媒体域名连接 10s 超时，未冒充通过；仅恢复同一已检查暂存包，由发布主机按同样 63 对象 HEAD／1024B 206 及每请求 20s 上限核验后走原 CAS。批准 SHA `c03324b007b7f9775b4b4f9966bec6918c35fd44602609149e8ede153b4a6bbd`，事务 `applied-http-verified`，verifiedAt `2026-10-21T12:56:24.601090+00:00`，include `30403daf587c3e9d4816650af117728841ca8a4dcdab32c56f15e1d3b4082d17`；根 donor、vhost 和既有资源保留，未回滚。

首次真实公网遍历桌面只完成 113 点、40 项失败，随后浏览器协议调用超时，手机与性能未执行。这份失败原件没有替换或改判。确认执行已退出后，仅在原专用组内恢复自己的页面；第二次完整公网遍历桌面 117/121、手机 121/121，Proof 6/6、交互 11/11。桌面四个相邻失败共享一次反向 Figure2 传输故障：原 Range `2555904-` 零正文，约 4.3s 后 watchdog 用完唯一同源重载，重载仍零正文并在约 15s 报 `ERR_EMPTY_RESPONSE`，原 20s 正确失败。一个重载不能保证穿过连续两次真实传输故障；网络中具体哪一跳异常仍未隔离。独立原字节 Range fetch 正常不反证该次原生失败。

第二次完整公网原性能矩阵 16 项全部取得实测、0/16 达标。另做不改像素／证明的原生 API 只读计时，发现 v69 的“seeked 立即证明”抢在 rVFC 前触发昂贵视频→CPU 拷图：桌面 TTG 29 次，单次 drawImage P95 44.3ms、最高 52.3ms，而像素读取最高仅 0.1ms；手机 Crane 115 次拷图累计约 603.5ms。这是 v70 撤回该优化、恢复原 rVFC 优先／8ms 真实像素兜底的具体依据；保留有界断流恢复，不以诊断当 FPS 合格。

全部 146 份原始失败／实测／截图与执行源保存在 `/www/wwwroot/tongye.me/route-backups/native-r5-81daca0/qa-evidence-v69-20261021-30532e68.tar.gz`（34,379,267B，SHA `62ebf55b63a8544d8957462dd82621241e1969ef00b07819c201838fb97d842b`），服务器读回一致，归档 0600／目录 0700。原本地 `/tmp` 在后续迭代中被外部清理；未借用遗失报告给 v70 资格。v70 证据改存用户指定的持久制品目录。Ego 的 `process.pid` 是共享工具进程，不是可安全终止的单轮 PID，执行所有权改用唯一执行标识及完整清理标记。

## 历史公开版本：v68（2026-10-21 17:58，Asia/Shanghai）

按用户持续有效的“只要比上版好就可以发布到公网”与“查清失败、继续迭代”指令发布增量修复，不将发布解释为原滚动、正式内存或真机资格通过。入口仍为 `https://tongye.me/experience/`，release `r5-370e09e`，应用 source `370e09e3f18036fdcd5d8f903005d5cd7f66902c`，annotated tag `react-refactor-r5-parity-repair-candidate-v68`／object `9d89c6c27a7590a7515e17ec086d93e12f9e4787`，manifest SHA `a3612cbe7f78555013d8ed81415544fdc093622b18371ab9930a430a32c1060f`，artifact tree `83da9f4477b7233e434ec49c4c9170d5b87e00ce70e521ad6b9bf430864df224`。应用、发布工具和标签均已提交并推送 main。

这轮公网失败不是十三个独立 bug：v67 手机首轮的七个 PH 相邻点共享一次前景图失败。真实网络原件显示，同一 `ph_front-alpha` WebP 的 CSS 蒙版走 `cors`，1,052ms 完整取回 484,606 B；普通 `<img>` 走 `no-cors`，另一条请求收到零正文，105,695ms 后报 `ERR_CONTENT_LENGTH_MISMATCH`。图片准备门禁阻止尚未完整的画面入场，也连带延后了视频激活。不能据此认为素材文件损坏：另一条真实请求已完整成功，冻结 SHA 和独立公网正文校验也一致。

v68 只将手机 PH 前景 `<img>` 的 `crossOrigin="anonymous"` 放在 `src` 选择之前，匹配既有 CSS alpha 蒙版的请求模式；不换 URI、图像、布局、动画、透明度或媒体期限。用同一冻结 WebP 的真实 HTTP 截断夹具复现：仅对多余的 `no-cors` 请求发送原文件 32 B 前缀后断开，CSS 蒙版仍正常接收全部原字节。两轮交换版本顺序，v67 均失败，且各有一条完整蒙版请求与两条浏览器尝试的截断图片请求；v68 每轮只发一条完整 `cors` 请求，并分别在约 1,129／1,374ms 内取得真实已解码、暂停且不再 seeking 的媒体姿态。它证明修复该请求所有权／重复下载失败类别，不证明 CDN 永不丢包或所有首次加载问题均已解决。

冻结验证：1,838 项当前单元断言（1,750 Vitest + 相同 88 项原生 `node:test`），零跳过；新增 PH 请求模式契约先复现一项失败，再修复，23 项定向回归通过。保留全部 v67 断言及原 5s／显式 15s 案例期限。类型检查、lint、构建和原包体门禁通过；发布／回滚保护另 123 项通过。桌面／手机各 121 个正反向点合计 242/242，Proof 6/6，原视觉 12/12（通道差 >24、比例 ≤0.005、非空画面门限不变，10 项像素全同）；另加手机 `lab-ph`／`ph-education` 两项对照均逐像素一致。63 个 CDN／媒体对象的源路径、长度与 SHA 全部不变，总计 79,330,267 B。

冷媒体原条件仍为 400ms 首字节、16KiB/10ms、目标缓存禁用、两轮交错顺序、相同电源设置。首轮是 **39/40**：新版 20/20，旧版一项在画面就绪后第二次读取时撞上视频短暂归位 seek，不改判成通过。随后收紧原探针为同一次浏览器求值同时满足原姿态谓词及全部原生视频暂停／不再 seeking，仍用同一 25s 上限。一次脚本漏记 `paused`、一次中断 CLI 后独立 Ego Node 仍继续操作原页造成重叠，两份部分报告均明确排除并原样保留；确认残留执行结束后，最终独立完整复测 **40/40**，每项都记录真实 `paused`，有独立 Node PID 与全部浏览器清理结束标记，没有用修改产品就绪字段来通过。

健康加载不是全面提速：最终同轮桌面中位 v67 3,376→v68 3,383ms、nearest-rank P95 5,552→7,442ms、显式 load 4→4；手机中位 3,510.5→3,483ms、P95 4,673→4,521ms、load 26→27。桌面 Hero 两个新样本为 5,584／7,442ms。每端每版本只有十个值，完整尾部保留；主要改善是已复现的重复请求／失败类别，不以这些数据宣称所有路径、首页或 TTFB 更快。

实际发布：748 项真实隔离 Nginx、748 项公网 HTTP 均通过；63 个 CDN 对象不可变上传，原 Node HTTPS HEAD／MIME／长度／缓存／CORS 与 1024 B 视频 206 Range 检查通过，本次未用等价执行器恢复。另对原八个首页关键对象及 PH 前景图共九个公开完整正文校验 SHA、长度、MIME、CORS 和原 20s 上限，全部通过。公网 HTTP 原件读回 SHA `a533557036175ad64d5009b7af58c062d00cd56618b4328429edcfc24f8bbbe7`。

精确批准记录 `scripts/authorizations/v68-ph-cors-publication-20261021-r2.json`，SHA `649860625c1c0976be908ec755b6726a48e218f9424ab3ea81baddced7fc0e10`。首份包因缺失内存声明的说明文字不符合既有精确格式被实际校验拒绝，未上传／发布；原包及首份 SHA `13443850…` 记录保留。r2 仅使用原规范的零轮／`pass=false` 声明文字，未改应用、数字或验收契约；默认 qualified 路径仍拒绝。正式内存 0 轮，清单保持 `pending-memory`，真实 iPhone／Android／WebKit 仍未资格验证。

事务为 `applied-http-verified`，verifiedAt `2026-10-21T09:58:56.150365+00:00`，include 从 v67 的 `96141ee3…` 切为 `2db02d2bbc08b4fbde6e1d05beccbbf0ee9dfedb391b755161133ba7915809cf`。vhost SHA 仍为 `a33d6b8b…`，根 `current` 仍为 v55 donor；v55／v59／v60／v63／v64／v65／v67 旧 JS／CSS 继续可用。没有安装浏览器、更改电源／代理或操作其他页面；未回滚。

真实公网浏览器首轮：两端均从根入口就绪，桌面 **121/121**，手机 **119/121**；Proof 6/6、菜单／CTA／前后退／联系页刷新 11/11，网页错误记录 0。手机 PH 这轮只发一条 `cors` 前景请求并完整收到 484,606 B，七个 PH 相关点全部通过。相对 v67 的首轮十三项失败，这轮观测到两项；单轮差异不是所有设备／网络可靠性提升的统计证明，也不将旧失败改判。

剩余两点同属反向 `crane-contact` .25／0 的一次真实收敛失败。新增只读原生轨迹捕获到失败前状态：人物视频 `readyState=4/networkState=1/paused=true/seeking=false`，鸟群视频持续 `readyState=1/networkState=2/paused=true/seeking=true`，目标时间 0.833333s。对应原始 `bytes=458752-` 请求得到 206 和正确 `Content-Range`，却在约 **20,156ms 内收到零正文**，随后才被原收敛期限取消；`ERR_ABORTED` 是清理后果，不用它倒因为果。发布主机对相同 458752、655360 和全文件三个区间独立取回完整原字节，SHA／长度／MIME／CORS 及原 20s 上限全过，耗时约 0.052／0.059／0.177s。这将证据收敛到该次传输／取帧停滞，不能据此确定某个代理、CDN 节点或解码器是唯一根因；没有提高期限或伪造鸟群已就绪。

公网原八段 × 双端矩阵最终 **16/16 取得原 10s／20%→80% 实测，0/16 达标**，没有准备阶段跳过。RAF P95 34.1–50ms，原上限仍为 20ms；桌面 TTG／PH／Crane 姿态滞后 P95 约 100.4／115.3／200ms，手机 Crane 为 **3,519.7ms**，且未通过收敛／最终姿态；手机 Figure2 还有一次 >50ms LongTask。空白静止约 17.3ms，主动滚动桌面约 34.4ms、手机约 49.3ms；不把共同环境帧间隔解释为全部应用滞后。首个性能尝试在 Node 读取公网清单失败时中止，0 项实测，原件保留；完整复测改由同一真实浏览器读取并逐段校验原公开清单 SHA，原采样／汇总函数的 measurement SHA 完全相同，视口、焦点、期限、指标和阈值不变，也不替换公网资源。跟手流畅度仍未修好，不能因为加载类别改善而宣称整体资格通过。

备份 `/www/wwwroot/tongye.me/route-backups/native-r5-370e09e/` 保留实际包与前后 include、批准、缺失内存声明、原 Nginx／公网 HTTP 及事务。必要时仅用原 CAS 回到 v67：

本轮另外 117 项原始报告、截图、执行源及完整逐文件哈希索引已归档为该保护目录下的 `qa-evidence-v68-20261021-0bd3138e.tar.gz`（32,586,087 B），服务器读回 SHA `fee2a21e706a3b049678a7fa1f25a3be22688da41d2959cc90a44bb09cf909e9` 与本机一致。归档与独立收据 0600、目录 0700；真实首轮失败、被拒元数据包、无效／重叠脚本尝试均保留，没有删图或改判。三个本项目临时冻结服务器已停止，Ego 专用组 41 以 `finish({keep:[]})` 结束，仅关闭自己的空白验收页，没有操作其他页面。

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/native-r5-370e09e/publish-experience-release.py rollback --release-id r5-370e09e
```

## 历史公开版本：v67（2026-10-21 16:42，Asia/Shanghai）

Release `r5-ab570a1`，source `ab570a1fc3d41de5d9a147d4c4f95df0e6d01419`，annotated tag object `d3adaee87e988957d2291eb502a5681ca22cb167`，manifest SHA `beaf7837a77bf4260f38d22cac784454c6c9de58ef8d8d744a6a1328d5c3f9cb`。本版修复两类代码问题：视频仍在真实 `NETWORK_LOADING=2`、没有媒体错误且唯一重载额度已耗尽时，保留最终活跃请求至原 19s 总期限，不在 4s 停滞检查时再次提前放弃；保留原单次重载、19s／20s／25s 期限及闲置／无源失败。相同 6s 视频首字节条件下，v65 两次约 4.8s 失败，v67 两次约 7.4s 真正就绪。另将每次解码新建的 1×1 读像素 Canvas 复用为每个活跃 driver 一份，仍实际读取像素、保留原证明和释放；四轮桌面对照分配 186→4，不是正式 RSS 或帧率合格证明。

先行 v66 未公开：其手机 Hero–Pattern 视觉差异约 4.8125%，超原 0.5% 门限。实际定位到 Pattern 首帧任务被停动画操作取消、真实滚动绘制后准备 promise 未解锁、手机准备 token 未绑定当前所有者，以及平台只等待底图而没有等待既有完整合成证明。v67 修复这些准备／所有权接口，不改图像或动画参数；原失败、真实完整旧参考及两轮新文档零差异检查均保留。冻结 242/242、Proof 6/6、原视觉 12/12，1,837 单元断言及 104 发布保护通过。

666 项隔离 Nginx与 666 项公网 HTTP、八个关键正文 SHA 通过；本机 Node 两次连接媒体域超时后，发布主机按相同 20s／六并发批次／全部原 HEAD、CORS、MIME、长度、缓存与 1024 B 206 Range 检查恢复完成，再用原 CAS 切换，未改代理。事务 verifiedAt `2026-10-21T08:42:17.093592+00:00`，include `96141ee37ae7c6436da89e6b70e0b9f1f19fa0068d0bac52c359af1a41352f56`。

实际公网首轮：桌面 121/121、手机 **108/121**，Proof 6/6、菜单／CTA／前后退／刷新 11/11。手机十三个失败点分为 PH 图片七点、Figure2 反向收敛两点、AOD 准备四点；只有 PH 记录到真实正文截断，不能用失败释放后的 `readyState=0` 反推另外两类的前错误解码状态。十六项原滚动检查全部取得 10s 实测，**0/16 达标**；RAF P95 33.9–50ms，原上限 20ms，部分还失败于姿态滞后／长任务。空白静止约 17.4ms、主动滚动约 34.3／37.9ms，环境影响不解释全部应用滞后。本版失败与未知项不因后续版本修复而改判。

186 项原始报告、截图、执行源和完整逐文件索引已归档到 `/www/wwwroot/tongye.me/route-backups/native-r5-ab570a1/qa-evidence-v67-20261021-408fcd08.tar.gz`（75,587,234 B），本机／服务器 SHA 均为 `1bb42dac0fa0e09b96b7ea5bf4ae23ad92229c3da6e38fa96435a24c2a287460`，归档及独立收据 0600、保护目录 0700。批准 SHA `17ccc51e…`，清单仍 `pending-memory`，正式内存／真机未合格。

## 历史公开版本：v65（2026-10-21 14:27，Asia/Shanghai）

按用户最新指令“只要比上版好就可以发布到公网”发布增量修复；不把公开发布等同于原性能、内存或真机资格通过。当前入口 `https://tongye.me/experience/`，release `r5-ae7c4ee`，应用 source `ae7c4ee56b94a52a06a9b4c8565002236b2b7dde`，annotated tag `react-refactor-r5-parity-repair-candidate-v65`／object `7b7c07074b778763d7472fe443fc7f94e94f4ea1`，manifest SHA `ff3c9543dd5114c4fcbac49d2aabce093b78512dc5ab3f897ce188a646f3dab5`，artifact tree `f4087ef6520b9ffa9e999653dc57af38418d0c85a7684d9119868cda72a93cbf`。应用与发布工具均已提交并推送 main，标签也已推送。

本轮查清、修复两类不同的“媒体有数据但准备不能完成”：

- v64 修复手机 Figure3 接收端：初始备用图胜出并取消旧端点任务后，原代码只给出场段提交滚动帧请求，入场接收端没有第零帧目标。现在连续滚动接收端也由同一 coherence 所有者提交目标，实际 Canvas 绘制后才报告帧证明。相同 3s 视频首字节延迟下，v63 两次均在约 20.317s 失败，v64 分别在 3.524s／3.329s 就绪。原报告保留，不伪造端点证明。
- v65 修复桌面失败图片恢复：v64 公网现场最终已有 `readyState=4`、`decoded-canvas` 的真实 Hero 视频，但两张 Hero middle 原生图片为 `complete=true/naturalWidth=0`；重复等待视频不可能修复这个图片状态。相同 URI 重新完整取回的文件与冻结 SHA 一致且可解码。现在图片解码与视频准备并行；仅对当前、仍连接、URI／srcset 未变且已证明加载失败的图片，按原 URI 重新选择一次。已取消或失效的所有者不重试，持久失败仍抛出错误，timeline 构建后的完整图片门禁继续保留。原 20s／25s 期限不变，没有换图、降画质或改动画设计。

恢复对照先观察真实原生失败状态，再做布局重新准备：只把当前两张 Hero middle 的测试 DOM URI 指向提供同一冻结 WebP 的本机故障夹具，首次请求真实返回 503；确认两张图确实 `complete/naturalWidth=0` 后执行 901→900px 布局往返，最终仍为 1440×900@1／`hold:hero:0`。v64 两次均无法恢复，v65 两次均以相同失败 URI 取回 200 并真实解码（190ms／2011ms）。这验证失败状态恢复，**不是首页冷启动耗时对照**，也没有伪造图片或帧就绪字段。前两组简单 503 注入新旧版都自行恢复，不能证明改进，完整保留为 non-decisive，不改判成修复证据。

冻结验证：桌面／手机各 121 点，共 242/242；Proof 6/6；视觉 12/12，仍用原通道差 >24、像素比例 ≤0.005、非空画面门限。1,824 项当前单元断言通过：1,736 项 Vitest + 相同 88 项原生 `node:test`，零跳过，仍检查原 5s／显式 15s 上限。图片恢复 red 报告的两项失败保留；修复后的 14 项定向测试通过。构建、类型检查、lint、原包体门禁通过，发布／回滚保护另 90 项通过。

视觉差异已进一步定位：首轮最大 961 像素差主要在导航颜色过渡，其他是标题边缘。`StoryNav.css` 保留原 220ms 色彩、300ms 透明度／位移过渡；取证记录到切场时颜色仍从深色主题渐变到浅色。没有关闭动画，仍在同一原期限内等待已有有限 CSS 动画结束后复测，三个受影响姿态的导航差异均为 0；Hero 还剩标题边缘 19 像素，另两姿态为 0，均在原阈值内。Pattern 双端原对照即为零差异。首轮原图和差异位置、补充动画状态原件都保留。

同条件健康冷媒体 40/40 就绪：每次新文档从 `#method` 启动，再首次进入五个媒体区间，冻结字节校验、400ms 首字节、16KiB/10ms、两轮交换版本顺序、目标缓存禁用、电源模式不变。相对本轮重测 v60 基线，桌面中位 4333→3254ms（约 -24.9%）、nearest-rank P95 8827→5568ms、观测显式视频 load 30→6；手机中位 **3425→3504.5ms（约 +2.3%，没有提速）**、P95 4668→4644ms、load 24→24。每组只有两轮，完整尾部和所有失败／非决定性数据不删；它不是整站加载、TTFB、真机或每条路径都更快的证明。

实际公开检查：589 项真实隔离 Nginx、589 项公网 HTTP 均通过，公网原报告字节读回 SHA `25159cc6fb0a2feb7b4b9589eead0cd67298eb19eba05791b4dbc1e4a21f5e89`。63 个 CDN 对象（79,330,267 B）不可变上传，原 Node HTTPS HEAD／MIME／长度／缓存／CORS 及 1024 B 视频 206 Range 检查通过，本次无需等价执行器恢复。另独立验证 8 个桌面／手机首页关键对象的公开完整 body SHA、长度、MIME、CORS 和原 20s 上限，全部通过。

公网浏览器复测是实际 HTTPS、不替换请求／响应：两端从根地址首次进入均就绪；手机 **121/121**，桌面 **118/121**。剩余 3 点为同一次 `education-crane` 首次准备失败的 .25／.5／.75，原始错误 `Frame stalled ... readyState=0`，两视频一就绪、一无数据；图片均正常，**不宣称首次视频载入问题已全面解决**，也不把后续其他点通过改成首轮通过。Proof 6/6、菜单／CTA／前后退／联系页刷新 11/11，网页错误记录为 0。诊断墙钟 16.135s／16.691s 包含测试设置、清单读取和入场动画，不当作网页实际加载或 TTFB。

剩余 3 个 Crane 点在独立的新文档、同一原 25s 门限下另作复测为 3/3；这证明本轮并非每次都卡在这些位置，不会把首轮 118/121 改判为 121/121，也不证明首次解码可靠性已解决。

原八段 × 双端滚动检查最终覆盖 16/16，**15 类取得原 10 秒／20%→80% 的实际数据，1 类桌面 TTG 在准备阶段失败（readyState=1/seeking=true），不能写成全部性能数据已测齐；0/16 达原门槛**。首轮原执行器在取得桌面 4 类、手机 3 类后分别因 Figure3 首次准备失败及一次 Node 清单 fetch 失败停止，原报告保留。补测其余 9 类直接导入相同采样／汇总函数，measurement SHA 相同，所有视口／焦点／25s 准备上限及指标均不变；清单通过浏览器读取完整公开字节并核对同一 manifest SHA，未忽略身份验证或伪造缺失数据。

15 类的 RAF P95 为 34.3–98.9ms，原上限仍为 20ms；部分 Figure2／AOD／Figure3／PH／Crane 存在姿态滞后，最高约 1799ms，Crane 还未通过收敛／最终姿态和长任务检查。空白页静止约 18.2ms，主动滚动原对照 50ms、补测对照约 34.3／34.4ms；环境影响存在，但不能用它解释全部应用滞后，不能宣称跟手性能已修好。正式进程内存仍为 0 轮／`not-measured`／`pass=false`、清单 `pending-memory`，没有借用旧候选。真实 iPhone／Android／WebKit 仍缺失。没有安装浏览器，没有更改电源、全局代理或其他用户页面。

精确批准记录 `scripts/authorizations/v65-image-publication-20261021.json`，SHA `33c6e82af56cf25f0b1e125be351786314cad2ffc0a7f90984bcacd1371bbdff`；只允许这一份冻结包，不授权未来候选，不授予合格状态，普通 qualified 路径仍拒绝。事务 `applied-http-verified`，verifiedAt `2026-10-21T06:27:56.111329+00:00`，include 从 v64 的 `049b4b97…` 切至 `64e100361759a410764aee9f8872b693dc5239bb56a53046660e6de9b46695c8`。vhost SHA 仍为 `a33d6b8b…`、根 `current` 仍为 v55 donor；v55／v59／v60／v63／v64 旧 JS／CSS 地址递归字节校验并继续可用。未执行回滚。

备份 `/www/wwwroot/tongye.me/route-backups/native-r5-ae7c4ee/` 已保存事务、前后 include、精确资格／缺失内存声明、批准、实际包证据、Nginx 和公网 HTTP 原件。额外 307 项原始报告／截图／执行源及完整逐文件哈希索引已永久归档为该保护目录下的 `qa-evidence-v65-20261021-33f881b9.tar.gz`（108,255,967 B），服务器读回 SHA `d9f75cc053b912b5fbdb61b6067ba33e0d11be63e72cfe9d6a4fca1784483898` 与本机一致；tar 和独立归档收据均为 0600，目录为发布器创建的 0700。本机 `/tmp/tongye-relative-release-20261021-7Oo0ru/` 原件也保留，未删除、覆盖或改判任何失败。需要时仅用原 CAS 恢复到 v64：

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/native-r5-ae7c4ee/publish-experience-release.py rollback --release-id r5-ae7c4ee
```

## 历史公开版本：v64（2026-10-21 13:26，Asia/Shanghai）

Release `r5-ba51d44`，source `ba51d441f6a3db2cb4d9fb8080f38bb7742736c4`，manifest SHA `f128c562a66e1091c0d42c3af7fad0085edb63db00eefefc906731ad6e51c9dc`；实际原流程发布与 512 项公网 HTTP 检查通过，事务 verifiedAt `2026-10-21T05:26:05.424851+00:00`。v64 修复了上节 Figure3 接收端请求；其公网首次 Hero 准备失败和后续原生图片失败现场，促成本轮 v65 的有界恢复修复。另从 `#method` 独立进入的旧版章节检查为桌面 121/121、手机 117/121，手机 4 点同属一次 AOD 首次帧停滞；Proof 6/6、交互 11/11，另留有一条 Figure3 WebM `ERR_EMPTY_RESPONSE`。独立章节通过不替代已失败的根入口，不将全部故障归因于网络或浏览器。

## 历史公开版本：v63（2026-10-21 12:28，Asia/Shanghai）

用户本轮明确调整发布条件：“你再迭代一轮呢，主要看看是哪儿的问题，只要比上版好就可以发布到公网啊”。按此条件发布精确冻结的增量版本，不把发布解释为原性能／内存／真机资格通过，也不提高任何原数字门限。

`https://tongye.me/experience/` 已更新到 release `r5-ac18611`，应用 source `ac1861109ce612bf3e2c9bce1cee7846ec78f612`，annotated tag object `231447c23a0428e82874ba5fc53a8b28c4a99fe6`，manifest SHA `5c093a9f3e0dcfbc1c9ccf5694ef90b685e8d0947006026a72eccc78ce5961cf`，artifact tree `ec27f26e60dcd9e89bedb26c0b28021bd772e359a05c40410c352607f04a8209`。根地址仍转到这个入口；不要用根目录的 v55 donor 清单识别当前应用。

这轮定位并修复手机 Figure3 的真实帧证明缺口：初始备用图先胜出时，之后真正画出的滚动中间帧没有上报，导致画面已有解码／合成数据却一直等待至准备超时。现在仅在当前 coherence 已实际绘制、视频有数据且不再 seeking 时证明 Canvas，清除遮挡真实画面的备用图；不把中间帧冒充端点。交接前终止旧端点等待，避免其后台 stall retry 重载已由滚动控制的视频。legacy 端点行为和原 20s／25s 期限不变。两项回归先复现失败，再修复通过。

同时上线此前已提交但未公开的重复 `load()`／旧 Hero 元数据 seek 竞争修复，以及 8 个 WebM 的无损前置 Cues；631 个 RGBA 帧、时间戳与原画质不变。初始 CSS 75,717 B、桌面 JS 516,645 B、手机 JS 619,202 B，原包体门禁通过。

发布前冻结验证：桌面和手机模拟各 121 个正反向位置全部通过，Proof 三个面板双端 6/6，视觉 12/12；11 项像素完全相同，桌面 Hero 仅 1 像素超过原色差阈值，仍在原 0.005 比例内。修复前两个候选复测均在手机反向 Figure3 处失败，原失败报告保留。单元断言覆盖 1,819 项：1,731 项 Vitest 与相同的 88 项原生 `node:test` 均通过，没有跳过断言；原生各案例仍在原 5s／显式 15s 内。首轮全 Vitest 的 3 项时限失败及随后复测失败不改判，单独保留。发布／回滚保护另 77 项通过。

同条件 40 次冷媒体准备均成功：每次新文档先启动在 `#method`，再首次进入五个媒体区间，响应使用逐字节校验的冻结包及相同 400ms 首字节延迟／16KiB 每 10ms，两轮交换版本先后顺序。它测的是媒体准备，不是整个首页加载或 TTFB。桌面中位数 v60 4,106ms → v63 2,743.5ms，观测的显式 `load()`（包含初始化和卸载）32 → 2；手机中位数 3,538ms → 3,396ms，样本不足以证明真机提速。**并非所有位置更快**：桌面 Hero 为 v63 8,047／5,592ms，对应 v60 5,433／4,848ms；桌面 nearest-rank P95 也从 5,433ms 变为 8,047ms。完整尾部数据保留，不把总体中位数改善说成各路径或尾部改善。

原三段 × 双端 × 双版本性能对照仍为 **0/12 达标**，均未通过原 20ms RAF P95；新旧版约 49–51.5ms，移动空白页对照约 49.7ms。v60 手机 Pattern 还出现 1 次 >50ms LongTask；v63 六项未记录到 LongTask。这些观察不证明帧率问题已解决。正式内存仍为 0 轮／`not-measured`／`pass=false`，清单保留 `pending-memory`；WebKit、真实 iPhone／Android 验收仍缺失。

本次只接受精确记录 `scripts/authorizations/v63-relative-publication-20261021.json`（SHA `6b237a250650fd9496dad385cfc0f807992b1ced8e8fab9327434f70ab8f73c1`），核验冻结身份、全部成对样本、整体媒体准备中位数／显式加载减少、完整功能及原视觉门限；不授权未来候选。普通 qualified 路径仍拒绝此未合格包。发布器补齐 v55／v59／v60 三代旧 JS／CSS 的递归字节校验及 URL 兼容，不改原根站点、vhost 或其他项目。

430 项真实隔离 Nginx 检查通过，63 个 CDN 对象（79,330,267 B）不可变上传。本机 Node 在媒体域连接超时后停止，未执行切换；改用发布主机 Python 执行相同 HTTPS HEAD／长度／MIME／31536000 缓存／CORS、20 秒总通过期限、6 请求批次及 1024 B 视频 206 Range 检查，全数通过后才切换，未改全局代理或安装浏览器。检查及执行源已存入备份。

事务状态 `applied-http-verified`，verifiedAt `2026-10-21T04:28:20.667209+00:00`。include 从 v60 的 `f6d49417…` 切为 `a1d77c56bafc83b99a81364c381c07a19634189c725a78e4188bf57bbb745e92`；vhost 仍为 `a33d6b8b…`，`current` 仍是固定 v55 donor。持久备份 `/www/wwwroot/tongye.me/route-backups/native-r5-ac18611/` 保存原始证据、缺失内存声明、前后 include、真实 probe、批准、CDN 复核及发布器。未触发回滚；回退精确恢复 v60：

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/native-r5-ac18611/publish-experience-release.py rollback --release-id r5-ac18611
```

公网 HTTP 原件另读回核验 SHA：430 项通过。公网浏览器复测使用同一个项目专用 Ego 组 13、真实 HTTPS，不替换请求或响应。v63 桌面首轮 117/121，反向 Figure2 一次 `readyState=0` 媒体准备失败连带 4 个位置；手机首轮也是 117/121，但原因不同：Brand→Figure3 接收端在慢首帧／poster 胜出后没有新滚动帧请求，视频已 `readyState=4` 仍超时，同一失败连带 4 点。它不是网络失败或验收误计，正在修复接收端请求覆盖，不改期限。两端 Proof 6/6，手机菜单／CTA／前后退／联系页刷新 6/6，桌面前四项导航通过。桌面刷新脚本过早读初始化全局而中止，修正等待后单独复测；不将它记成网站刷新故障。

最初公网脚本还错误请求了刻意不公开的 `cdn-publish-manifest.json`，收到预期 404 后未开始页面遍历。公开资格清单独立读回为本节精确 SHA；测试脚本改为只读公开清单，没有开放内部清单或改动网站。上述失败和脚本原件均保留。全部本轮原件暂存 `/tmp/tongye-relative-release-20261021-7Oo0ru/`，会随公网测试归档。

## 历史公开版本：v60（2026-10-21 01:33，Asia/Shanghai）

用户在明确获知本次性能未达标、正式内存和真机验收未完成后，确认“替换后做公网测试”。仅将该批准用于冻结的 v60：source `cb8c17affd9d171a206f19773a9a907cc1f20f1b`，annotated tag object `d1614ef5788312bcc48259a2b4941b3830fa04d2`，draft manifest SHA `978208bd19b5834dbade2a91340db0a09a161bd3d7ba89bd9bad8dd3445425ce`，artifact tree `80970dd1358c9c144c51172eb5670848f1a90f7ffe1916ee37e18e6b3c24271b`。

完整单测 215 文件／1797 项、lint、类型检查、packed-alpha 首帧、原生 `/experience/` CDN 构建和原资源／包体预算通过。原始本地失败证据保留；它们不是此 CDN 构建的正式资格。清单保持 `pending-memory`，独立内存文件明确声明 `not-measured`／0 轮／`pass=false`，不伪造测量、不借用 v59 两轮报告。数字门槛不变，普通 qualified 发布路径继续拒绝此包。

新独立批准记录为 `scripts/authorizations/v60-public-test-20261021.json`（SHA `a4357df7669a362473df1a0344233f3f830b9f88e9224b51aad8c39915ede5ae`），不授权未来候选。发布器只额外接受精确固定的 v59 前态，核验其已验证事务、include、清单及逐个旧 JS／CSS 字节；保留 v55 和 v59 的懒加载 URL。新增及既有发布保护 63 项通过；曾有客户端 fixture 在原 5 秒期限内启动超时，保留失败，不提高期限，改用现有捆绑 Python 3.12 后原 13 项全部通过。

`https://tongye.me/experience/` 已实际切换至 release `r5-cb8c17a`。348 项真实隔离 Nginx 与 348 项公网 HTTP 检查通过；63 个 CDN 对象（79,330,671 B）已不可变上传，原 HTTPS HEAD／长度／MIME／缓存／CORS 及 1024 B 视频 Range 检查通过。本机独立 curl 再次读回上述清单 SHA、source 和 `X-Tongye-Experience-Release: r5-cb8c17a`。

事务为 `applied-http-verified`，verifiedAt `2026-10-20T17:33:08.202229+00:00`。路由 include 从 v59 的 `01567f5b…` 切为 `f6d494173450b37a586392763af8b373f628a639a25fe14125acd9de992ffdd4`；本次检查时 vhost SHA `a33d6b8b…` 与固定 v55 `current` 均未改。首次 SSH 在远端暂存步骤断开，未切换路由；确认前态仍为 v59 后重试成功。原 v59 及 v55 文件、CDN 对象和备份未删除、未覆盖。

回滚备份为 `/www/wwwroot/tongye.me/route-backups/native-r5-cb8c17a/`，含完整前后 include、实际包 probe、公网 HTTP 原件、批准记录、原始失败及缺失内存声明、事务和本次发布器。未触发回滚；必要时执行以下 CAS 回退，精确恢复 v59，不是退回 v55：

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/native-r5-cb8c17a/publish-experience-release.py rollback --release-id r5-cb8c17a
```

### v60 公网浏览器复测

全部使用现有 ego-lite、真实公网 `/experience/`，无本地资源转接或响应替换。桌面 1440×900／手机模拟 390×844、DPR 1；它不是物理手机或 WebKit 证明。首轮往返各 121 个位置：手机 **121/121**，桌面 **100/121**。桌面失败集中在 `method-bottom-figure2`、`brand-figure3`、`education-crane`、`crane-contact` 的媒体准备；其中另有一张 Crane 图片明确记录 `net::ERR_NETWORK_CHANGED`，不能据此把所有视频超时都归因于网络切换。

两端 Proof opening／cards／closing 共 **6/6**，正文可见且 hold 恢复点击能力；桌面原失败位置另作加载后复测 **21/21**，无网页错误，但不把首轮 21 项失败改判通过。实际点击 CTA、手机菜单、刷新和前后退共 8 项 URL／range／ready 状态检查通过。联系页刷新截图抓在加载遮罩退场阶段，没有追加遮罩隐藏后的截图；该截图不证明遮罩长期卡住，也不作为刷新后最终画面完全验证的证据。初次进入的加载遮罩隐藏检查已在双端主遍历中通过。

原八段 × 双端、每段 20%→80% 连续 10 秒的性能矩阵完整采集，**0/16 达标**。空白页 RAF P95 为 18.4／18.5ms；应用 RAF P95 为约 49.3–51.2ms，Pattern 为桌面 50.1ms／手机 49.4ms，高于原 20ms。桌面 TTG／Crane 另有姿态滞后超标。两端全段视频保持暂停、没有记录到 >50ms LongTask，采样中清单身份不变且网页错误为 0；这些不抵消帧率或滞后失败，不能声称流畅度已解决。

独立本机 HTTP 读回另通过 6 项规范化／www／HTTPS／gzip／入口及清单字节检查，22 个视频的 1024 B Range 全部 206，前缀逐字节哈希与冻结包一致。正式内存仍为 0 轮，真机／WebKit 仍缺失。本项目专用 Ego 组 21 已正常关闭，未操作其他页面或全局电源／代理设置。

本轮原始 JSON、实际截图和每轮执行源在 `/tmp/tongye-v60-public-test-20261021-BAFOQR/`，其中 `public-functional.json` 保留首轮失败，`desktop-failure-recheck.json` 单独保存复测，`public-performance.json` 保存完整未通过矩阵。结论为“已按明确指令发布公网测试版，仍有验证失败”，不是正式合格发布。

## 历史公开版本：v59（2026-10-20 21:30，Asia/Shanghai）

`https://tongye.me/experience/` 已切换到原生连续滚动 **v59**，release `r5-c1ee8fd`，应用 source `c1ee8fd386d92ee34d408eb0e094fa87ae21de35`。根地址继续 302 到此入口。公网清单 SHA `1b7d486bfb046f840cd65d51e4d2e915fe270cea383b3b4c38bcb1eba08c58d8`、artifact tree `83b30c789256bcbe3643cf364f1f491c96915f071de91e59c2aaa33932baf034`；独立本机 curl 读回确认 v59，响应头为 `X-Tongye-Experience-Release: r5-c1ee8fd`。

实际包 **249 项隔离 Nginx 检查及 249 项公网 HTTP 检查全部通过**，包括新旧 JS/CSS 字节、MIME、缓存、入口、规范化跳转、服务／FAQ 和 404。63 个 CDN 对象（79,330,671 B）已不可变上传；63 项公开 HTTPS HEAD／长度／MIME／缓存／CORS 与原 1024 B 视频 206 Range 检查通过。最初本机 Node 命中不可达的 198.18 假 IP，未据此放行；改用服务器 Python HTTPS 执行同样的 20 秒期限、6 请求批次和完全相同的断言，检查原件及执行源码已永久归档。

事务状态为 `applied-http-verified`，verifiedAt `2026-10-20T13:30:01.152006+00:00`。活动路由 include SHA 从 `c4631c1e…` 切为 `01567f5ba32d8ecca93ec95a8a4cdf76f132a61ca208e2d74e8f9db0e4b20d71`。Vhost SHA 仍为 `77871e37…`，`current` 仍为固定 v55 donor；其他项目路由、预览及原根资源未改。**原根 `/r5-release-manifest.json` 描述 donor，不是 `/experience/` 当前版本；识别现网应用须读带 `/experience/` 的清单。**

本次是用户明确指令发布，模式 `user-directed-with-known-validation-gaps`。原 `pending-memory`／`pass=false` 及已知性能、设备覆盖缺口全部保留，不把实际发布等同于原验收通过；没有再操作 Ego 或启用 Actions。发布工具 32 项原事务／MIME、9 项指令绑定以及 13 项客户端／根路径保护回归通过。下文旧日期和“未发布”的描述均是对应历史阶段，不是当前线上状态。

持久备份：`/www/wwwroot/tongye.me/route-backups/native-r5-c1ee8fd/`，含前后 include、原始失败证据、直接指令、CDN 检查与执行源码、真实 Nginx 报告、249 项公网报告、事务记录和经过测试的发布／回退脚本。没有触发回滚；需要时使用原 CAS 回退，不覆盖其他后续配置：

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/native-r5-c1ee8fd/publish-experience-release.py rollback --release-id r5-c1ee8fd
```

## 2026-10-19 线上状态与边界

- 旧官网入口：`https://tongye.me/experience/`。
- 根地址及 `/index.html` 暂时 **302** 到 `/experience/`，保留查询参数；浏览器验证旧 `/#education` 书签仍进入对应章节。新首页完成后再撤销这两条临时跳转。
- `/experience`、`/experience/index.html` 规范化到带尾斜杠入口；Brand 调试入口为 `/experience/brand-lab`，仍为 noindex。
- `/services/`、`/faq/`、备案链接、HTTPS、www 规范化、真实 404 保留。
- 原有显式预览 cookie 仍读取其原预览目录，不受根地址临时跳转影响；`/experience/` 不随预览 cookie 切换版本。
- **没有构建或上线 main 的连续滚动迭代，也没有创建新 R5 候选或新的性能资格。** 这是给当前公开 v55 增加的独立路径适配层，不是旧站性能优化或新首页交付。

## 冻结的 donor 与适配层

`current` 仍指向 `/www/wwwroot/tongye.me/releases/r5-ef69e06`。

- Source commit：`ef69e06a3c9f6e6624c7beb0acf903afae55e32e`。
- 原候选：`react-refactor-r5-parity-repair-candidate-v55`。
- 原资格清单 SHA-256：`46609b35907e855e6be6bd8763a9a9b589be1910801e5cd106e537cd3aa67c4f`。
- 原 HTML SHA-256：`fc904f6e1f7a23f1fa1238e6049f94a032f647dad00e49dd6401697d17d97fa7`。
- 原入口 `assets/index-CexTKEg.js` SHA-256：`aa327b78ccacf92838f5ad53097a37cd54bf76eca164612126c91b99fab96692`。
- CDN 仍为 `assets.tongye.me/releases/r5-ef69e06/` 与 `media.tongye.me/releases/r5-ef69e06/`，无对象覆盖、上传或删除。

独立 mount：`experience-v55-20261019-02`，目录为 `/www/wwwroot/tongye.me/mounts/experience-v55-20261019-02`。

只对冻结包做确定性的路径适配：路由分类、手机预启动/Brand 路径、CSS 预加载与 Worker 地址、恢复清单地址、HTML/图标/Web App 清单/页面元数据路径。保留原模块相对导入关系，避免加载两份 React。动画、样式与媒体源不作重构。

- 7 个 JS 路径覆盖文件、HTML、3 个 Web App 清单，共 11 个文件；未改动文件由 `/experience/assets/` 映射到固定 v55 目录，而不是未来会切换的 `current`。
- 覆盖文件采用 `no-cache`；固定 donor 的其余资源维持 immutable。原根路径资源也保持原字节，兼容已打开的旧页面。
- `/experience/mount-manifest.json` 单独记录每项 base/override 哈希，并明确声明原 R5 资格只描述 donor，不能用于证明路径适配层或 main 的发布资格。
- `/experience/r5-release-manifest.json` 保留 donor 原字节，专供旧版手机恢复控制器识别其自身版本，不跟随未来新首页的清单。

Mount 清单 SHA-256：`a8c155dc3c2e9f3cf0c8ce276d724a8f80b7757332ddab98ae6ec5d78df81ed8`。

## 已执行验证

- 路径适配单测 6/6；配置事务/拒绝覆盖/失败回退/验收记录测试 12/12。
- 7 个生成的 JS 覆盖文件语法检查通过；冻结包所有声明文件均核验字节数及哈希，CDN 文件从原发布包声明的 sibling `cdn/` 读取，不跳过缺失素材。
- 本地 HTTP 130 项通过；服务器另起仅监听 loopback 的独立 Nginx 实例，123 项真实处理器验证通过，再切换公网配置。
- 公网 HTTP **135 项通过**，其中 112 个 JS/CSS 文件逐一检查状态、MIME 与预期 SHA-256；覆盖根跳转、带参数规范化、Brand、Web App 清单、原恢复清单、服务/FAQ、404、www、HTTP→HTTPS、预览 cookie 隔离、原入口字节和 CDN 视频 CORS/206 Range。
- 公网 Chromium 桌面 1280×800：从带查询参数和 `#education` 的旧根地址进入新路径；脚本只读取 `/experience/assets/`；场景可交互，未观察到同源资源 4xx/5xx。
- 公网 Chromium 手机模拟 390×844、coarse pointer：Hero、菜单→留学→联系、刷新、后退、Brand 入口均达到 stable/readable 状态，同源资源未观察到 4xx/5xx。
- 关闭 JavaScript 后，静态正文可见，主标题及章节链接正确，加载遮罩隐藏。
- 切换后再次通过 SSH 核验原 HTML、入口 JS、资格清单及 `current`：均未变更。Nginx 配置检查通过。

浏览器截图用于入口与排版抽查，不是逐像素逐帧黄金图比较；未重跑完整性能、内存和真机发布资格，不据此改变此前 main 的未通过项或验收标准。

本机原始证据在 `/tmp/tongye-experience-20261019-J3euT4/`，包括 `public-http.json`、迁移前截图和 `public-*` 截图；公网 HTTP 报告同时持久保存到下述服务器备份目录。

## 配置、故障记录与回退

- Vhost：`/www/server/panel/vhost/nginx/html_tongye.me.conf`。
- 路由 include：`/www/server/panel/vhost/nginx/tongye-experience-routes.inc`；原 SEO include 和预览映射不修改。
- 活动配置原 SHA-256：`ea6b5819b0867ed5ad133a0eca478c8a926ae6ab1f21e5907df1b7f37bc1be65`。
- 活动配置新 SHA-256：`559c31979eea33210ae78872e1cab86d4dbcae94a9551dd9f039aac486b996e4`。路由规则本体在独立 include 内，其 SHA 由事务记录另行保存，不能只核验 vhost。
- 备份目录：`/www/wwwroot/tongye.me/route-backups/experience-v55-20261019-02/`，包含 `vhost.before.conf`、`transaction.json`、`http-smoke.json` 及回退脚本。

首次切换中，字面文件 alias 用于尾斜杠 `/experience/`，触发 Nginx index 模块拼接出 `index.htmlindex.html`，公网检查发现 500 后立即恢复原 vhost 并重新加载。失败事务 `experience-v55-20261019` 与规则副本保留在其备份目录。修复为 `root <mount>; try_files /index.html =404`，在真实隔离 Nginx 中验证不会追加文件名、不会与规范化跳转形成循环后，使用新事务 `-02` 再次切换成功。

必要时，在服务器上执行：

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/experience-v55-20261019-02/apply-experience-mount.py rollback
```

回退会核验当前 vhost、mount 清单和路由 include，拒绝覆盖他人后续改动；恢复原配置后检查并重新加载 Nginx。保留适配层文件和证据，不删除旧发布、源码或 CDN 对象。

## 新首页接入时

1. 新站使用独立构建入口及自己的资源命名空间，不导入或预加载旧版运行时。
2. 保留 `/experience/` 的固定 v55 资源映射和覆盖规则；不要随新首页的 `current` 切换旧站资源。
3. 只撤销公共 `/`、`/index.html` 的临时 302，接入经批准的新首页；按当时需求确认是否继续保留历史预览 cookie 入口。
4. 重新验证新根入口没有加载旧站 JS/CSS/视频，同时复测旧体验、服务/FAQ、书签、缓存和 404。

重建适配层仅使用 `scripts/prepare-experience-mount.mjs` 的固定 v55 donor；上线前用 `scripts/probe-experience-nginx.py` 验证真实 Nginx 规则，再使用带预期 vhost 哈希的事务脚本。不得拿这套路径适配脚本绕过任何未来新版的完整发布门禁。

## 原生新版的发布边界与发布前记录（2026-10-20）

### v59 的明确直接发布指令（2026-10-20）

在完整披露 v59 的两轮共享 RSS 超限、双端性能 0/16 和缺失的设备覆盖后，用户继续明确要求“你切换啊。你管 ego-lite 干嘛”，在询问是否按这些已知缺口直接发布之后再次回复“不用啊。你直接切换啊”。本次按该直接发布指令推进 **固定 v59**，不再要求用户处理 Ego；不将该指令扩展到其他候选或未来发布。

独立指令记录 `scripts/authorizations/v59-direct-publication-20261020.json` 绑定 source `c1ee8fd…`、annotated tag object `b8b141c…`、artifact tree `83b30c78…`、原 draft manifest `1b7d486b…` 和三份原始失败证据的精确 SHA。`package-user-directed-v59.mjs` 逐文件核验、拒绝覆盖现存包，保留原 `qualification.status=pending-memory` 和 `pass=false`，不会调用 finalizer 伪造通过。源码应用不重建、不改变 v59 的任何 JS／CSS／素材字节。

现有发布器只有显式提供这一记录的固定 SHA `0721104d84e66c813e5b1a2db98796b05bdc8b776be777b2b44b3ff202c534a8` 才接受该特例；默认路径继续拒绝 pending／失败报告，任意其他记录、候选、产物或被修改的证据均不能使用它。原文件清单、CDN 不可变上传／验证、实际包隔离 Nginx、路由 CAS、旧资源兼容、精确回滚与公网 HTTP 检查仍执行。事务备份永久保存直接指令与失败原件，状态明确记录 `user-directed-with-known-validation-gaps`，不声称原验收已通过。

发布事务 30 项原测试、新增 9 项指令绑定／篡改／默认拒绝／回退测试，以及客户端／根路径保护 13 项全部通过。实际切换结果以服务器事务和公网读回为准，下文的旧标准与历史未发布状态不作追溯改写。

实际包首轮隔离检查发现 favicon.ico 为 HTTP 200 且字节 SHA 正确，但 Python MIME 推断为 `image/vnd.microsoft.icon`，与已配置 Nginx 的 `image/x-icon` 不一致；没有上传 CDN 或切换活动路由。新增回归先复现该失败，再显式匹配服务器 MIME 映射，并把 ICO 加入真实 Nginx fixture。原失败暂存 `/tmp/tongye-experience-r5-c1ee8fd-yMIOXx` 保留；应用产物、图标字节、验收状态与直接发布记录不改。

下一轮隔离检查又发现服务器旧 Python 对 WebP 推断为 octet-stream，但实际 Nginx 正确返回 image/webp，字节仍完全相同；该失败暂存 `/tmp/tongye-experience-r5-c1ee8fd-Lsd3cM` 保留。现对本发布实际用到的 ICO／WebP／PNG／SVG／TXT 显式采用已读取的服务器 mime.types 映射，不以系统推断结果充当验收期望；新增回归先复现 WebP 失败，并将这些静态类型加入 HTTP fixture。没有删除 MIME／字节检查或修改任何应用文件。

源码现支持 `R5_BASE_PATH=/experience/` 原生构建：路由、手机预启动、恢复清单、图标与 Web App scope 使用同一前缀；未设置时保留根路径开发构建。构建入口不引入另一套路由库或提前导入场景。Canonical 的 WebPage 标识跟随体验路径，组织、全站、服务与 FAQ 的公开身份仍留在原根地址。

发布草稿及打包清单记录 `basePath`；冻结内存资格完成前不得更换构建前缀。原 `scripts/deploy-r5-release.mjs` 只切根站点的 `current`，现会在任何 SSH／上传之前拒绝显式非根路径发布包。上面的 v55 适配脚本也不是新版发布器，不能换一个 release ID 就复用。

原生新版需要独立的 `/experience/` 发布事务：新不可变目录、活动路由 include 的比较后切换及精确回退；保留临时根跳转、预览 cookie 隔离、根服务／FAQ，以及旧体验已打开页面按旧哈希延迟加载资源的能力。不能只把 `/experience/assets/` 换成新目录后移除旧覆盖文件或旧 donor。下节已补齐实现，但实际合格候选仍须先验证真实隔离 Nginx，再做公网身份、缓存、MIME、404、书签与浏览器交互复验。

原逐帧画面、性能矩阵、冻结身份两轮内存与适用的真机检查仍是发布条件。源码提交或普通 `build` 通过不等于这些条件已经满足；当前公开站点仍为上文固定 v55。

### 原生发布事务接口（2026-10-20）

沿用已确认的独立路由设计，不更换应用架构或根站点发布器：

- `scripts/deploy-experience-release.mjs`：客户端预检、唯一远端暂存目录、真实隔离 Nginx、不可变 CDN 上传／验证、切换和公网 HTTP 检查；公网检查失败时调用同一事务的回退。`--check` 只做本地检查，不 SSH、不上传。
- `scripts/publish-experience-release.py`：服务器端 `validate / probe / apply / verify / rollback`。拒绝根路径／dirty／pending-memory／借用其他产物的证据；逐文件及完整 artifact tree、CDN 路径、两轮原内存资格再次核对。Chrome 路径保留；用户随后明确批准正式采集使用 ego-lite，新增实际 Ego 身份及完整原始观测校验，不将旧 Ego 诊断报告改名当合格报告。
- `probe` 只运行 loopback 实例，不改活动配置；报告绑定候选清单、原 vhost、原 include 和待切换 include 的哈希。`apply` 必须提供该报告；只替换 include，`current` 和 vhost 始终不改。保存切换中状态，进程在替换前后被中断时仍可显式回退。
- 首次原生发布只接受已检查的 `experience-v55-20261019-02` 前态。备份在 `route-backups/native-<releaseId>/`；回退恢复的是这个 v55 mount，而不是迁移前根站点。已有目标目录、资源同 URL 异字节、配置并发改动或不匹配的回退前态均拒绝覆盖。
- 固定保留 donor 全部旧 JS／CSS 的精确 URL，包括 7 个改写过的 JS 覆盖文件；其余新资源落在新不可变目录。若新资源与旧 URL 冲突且字节不同，拒绝发布，不让已打开的 v55 页面加载到错误模块。

仅在应用原门禁全部通过、干净提交和 annotated candidate tag 绑定后，使用 `release:package` 生成的新路径合格包。命令参数中的两项 SHA 须在实际切换前重新读取，不能把历史值当成未来值：

```sh
node scripts/deploy-experience-release.mjs --package <qualified-package> --expected-vhost-sha <inspected-sha256> --expected-include-sha <inspected-sha256> --check
node scripts/deploy-experience-release.mjs --package <qualified-package> --expected-vhost-sha <inspected-sha256> --expected-include-sha <inspected-sha256>
```

必要时服务器端显式回退（不调用旧 mount 的根站点回退）：

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/native-<releaseId>/publish-experience-release.py rollback --release-id <releaseId>
```

离线事务测试与传输前拒绝测试覆盖身份、字节、原子切换、错误回退及并发保护；`scripts/test-publish-experience-nginx.py` 另用明确标记的临时合成 fixture 检查真实 Nginx 的尾斜杠、哈希、MIME、缓存、404 和旧资源处理。合成 fixture 不是应用发布候选，不能替代实际合格包的强制 probe。脚本、证据和暂存目录不会因成功或失败而删除已有发布或 CDN 对象。

## ego-lite 验收入口（2026-10-20）

用户已选择使用现有 ego-lite，不安装或恢复 Chrome／WebKit。开发复测可以直接使用 `app/scripts/verify-scroll-scrub-ego.mjs`，不需要 Playwright 或另一台浏览器进程。它与原 `verify-scroll-scrub.mjs` 共用 `scroll-performance-probe.mjs` 和原指标汇总，不维护另一套宽松采样。

先按 ego-browser 的操作边界取得本任务已批准、仍由 agent 控制的 TaskSpace ID 和已有 Page 标签，再在 `ego-browser nodejs` 中调用，例如：

```js
const { runEgoScrollVerification } = await import(
  'file:///Users/aitoshuu/Documents/GitHub/TongyeGuanmi/app/scripts/verify-scroll-scrub-ego.mjs'
);
const report = await runEgoScrollVerification({
  taskSpaceId: 12, // 历史示例，必须替换为当前批准且有效的组 ID
  pageLabel: 'p1',
  platform: 'desktop', // 另一轮使用 phone
  baseURL: 'http://127.0.0.1:4197/experience/',
  outputPath: '/tmp/tongye-scroll-ego-20261020-desktop.json'
});
if (!report.passed) process.exitCode = 1;
```

`12` 仅是历史示例，不是通用配置；本轮的组 12 和另经批准新建的组 6 均曾返回找不到组，不能直接复制该 ID 继续运行。每次须核对本任务当前已批准且有效的组。入口不自动新建／认领组、选择 profile、安装依赖或结束调用方的持续任务；用户接管或标签组失效时停止，不通过另一组绕过。报告必须使用仓库外的新绝对路径；已有报告拒绝覆盖，进度采用原子保存，避免空间不足截断上一份完整记录。

采样仍为原八段，每段预定位 20%、连续 10 秒到 80%；保留 P95 ≤20ms、姿态滞后 ≤100ms、停止收敛 ≤150ms、零次 >50ms 长任务及暂停视频、完整前台采样、区间／epoch／最终姿态检查。缺少 LongTasks 能力仍为 `null`／不可测，不能算 0 次通过。

导航显式沿用原独立 Playwright runner 的默认 30 秒，而不是 Ego 包装层的默认 15 秒；ready 仍为 30 秒、逐段准备仍为 25 秒。上述性能数值门槛不变，不能靠延长画面收敛预算消除失败。

Ego 入口额外固定桌面 1440×900／手机模拟 390×844、DPR 1 和页面级焦点模拟，逐帧记录并检查视口／DPR／焦点，避免 CLI 轮次间视口恢复或后台降频混入结果。焦点模拟属于测试调度，不是真实物理输入，不改变全局浏览器或电源设置。Runtime 事件按上下文与导航顺序分类：只有明确属于 `chrome-extension://` 且非默认世界的异常单独保留；网站默认世界、未知来源、日志错误仍失败。不会按错误文案或页面 URL 忽略异常。

报告记录产物清单哈希、实际采样函数哈希、Ego／Chromium 身份和环境；清单在段间及最终采样后再次核对。Browser.getVersion 不可用时如实记录 `null` 和原因，不伪装成另一浏览器。即使八段通过，`releaseQualified`、`memoryQualified` 仍明确为 `false`：共享 Ego 的整棵进程树包含其他标签，不能用本站 renderer RSS 替代原 1.5GB 整树门槛；Ego Chromium 也不能替代 WebKit 或真机证据。公开发布、冻结两轮内存和独立子路径发布事务的原要求不变。

## 用户批准的正式 Ego 内存采集（2026-10-20）

用户明确选择“用 ego-lite”作为正式内存采集环境。该批准不改变数值标准，也不把前述普通构建的诊断报告转为正式报告。Chrome 原路径保留；显式设置 `R5_MEMORY_BROWSER_CHANNEL=ego-lite` 才切到 Ego。

`app/scripts/run-r5-process-memory-ego.mjs` 只使用调用方指定、已批准且仍受控的 TaskSpace，先核验该空间内目标 Page 为 agent 创建且已停在 about:blank，再用两个新 Page／不同 isolate 完整采样；不新建或认领组、不选择 profile、不安装或启动另一浏览器、不关闭用户页面。只有成功完成一轮的自建 Page 才关闭；失去控制或页面错误时停止，不自动新建 Page 恢复。整树计数包含其他标签及所有后代进程，不减基线、不改成只数本站 renderer。

正式入口仍为 `evidence:memory:release`。示例中的组 ID／Page 仅应由当前有效授权填写，先把这个 agent-owned Page 停在 about:blank；不可复制历史失效 ID：

```sh
R5_MEMORY_BROWSER_CHANNEL=ego-lite R5_EGO_TASK_SPACE_ID=<authorized-id> R5_EGO_PAGE_LABEL=<owned-blank-page> R5_BASE_PATH=/experience/ pnpm -C app run evidence:memory:release
```

该入口只在 loopback 启动自己的预览并按原 30 秒期限等待，不接管其他服务；退出时只停止自己创建的进程组。所有原始轮次、完整报告和生成的单次调用脚本保留在独立临时证据目录。

每轮仍为原 33 个 hold／90 个中间姿态、250ms 整树／堆采样、两个原 5 秒空闲／GC 终点。采样从导航之前开始，不能漏掉冷准备峰值。必须是干净提交、annotated candidate tag、CDN-enabled pending-memory 清单；采集前后逐文件核验字节、artifact tree、served manifest、Git/tag 与产物身份。两轮必须不同 isolate、同一冻结身份；Node finalizer 与服务器发布器都重算 Ego 原始观测并拒绝超预算、缺段、虚报 pass 或改过的上限。

为避免在验收前上传新 CDN 对象，只在本任务 Page 的 CDP Fetch 层把清单内精确对象 URL 转接到本地相同字节；原 URL 和 Range 请求保留，不更改构建文件、素材或全局代理。仅使用短调用和有界轮询，避免等待资源的长 evaluate 阻塞请求处理。实际 WebM Range／解码、Canvas 可读及该 Page 的 module Worker 跨域 fetch 已逐字节验证，不需要浏览器级 Target 自动附加；该转接不代表公网 CDN 的可用性／带宽／CORS 已验收，正式发布仍须原不可变上传和 CDN 检查。

媒体源重置可能取消尚未处理的暂停请求。只有该 Page 上相同 session／networkId 的 `Network.loadingFailed(canceled=true, errorText=net::ERR_ABORTED)` 才能证明旧拦截无需继续；保留该证据及每项转接终态，不按 Invalid InterceptionId 文案单独吞错。未知／真正失败仍中止，所有原准备期限与网页异常规则保持不变。

Ego 报告如实记为 `browserChannel: ego-lite`、实际 macOS executable 和 `entire-shared-browser-tree`，不写成 Chrome。1.5GB 整树、512MiB GPU、1GiB renderer、192MiB 页面堆、资源窗口和两轮要求不变。共享环境超限仍失败；正式内存通过也不等于性能、WebKit 或真机资格通过，不会自动切公网。
