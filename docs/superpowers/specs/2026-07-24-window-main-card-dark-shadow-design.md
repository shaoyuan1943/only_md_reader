# 打开文件与设置窗口主卡片暗色阴影设计

## 1. 背景

阅读窗口的暗色卡片已经改为中性黑色、零偏移双层阴影：

```css
0 0 24px -8px rgb(0 0 0 / 52%),
0 0 8px -2px rgb(0 0 0 / 34%)
```

该形式消除了深色背景上的暖色亮带，同时让卡片四周保持均匀投影。用户已经确认这一视觉结果，并要求将同样的暗色阴影形式应用到打开文件窗口和设置窗口的主卡片。

## 2. 范围

本次只修改以下两个窗口主卡片：

- 打开文件窗口：`.open-file-window`
- 设置窗口：`.settings-window-frame`

明确不修改：

- 最近文件条目；
- 打开文件按钮；
- 设置按钮；
- 字体下拉菜单；
- 设置表单行；
- 阅读窗口卡片；
- PDF 通知及其他浮层。

## 3. 目标与约束

- 两个窗口主卡片在暗色主题下使用与阅读卡片相同的中性黑色、零偏移双层阴影。
- 明亮主题继续使用当前 `--panel-shadow`，视觉保持不变。
- 两个窗口主卡片共用同一个局部语义变量，避免重复阴影参数。
- 保留打开文件主卡片现有的 `1px solid var(--border-soft)` 边框。
- 不新增或删除其他边框、描边或 inset shadow。
- 不修改 `18px` 窗口 inset、`22px` 圆角、卡片宽高、内部布局、按钮位置或响应式行为。
- 不修改通用主题 token `panelShadow`，避免扩大影响范围。

## 4. 方案比较

### 方案 A：增加窗口主卡片共享变量（采用）

增加一个只供打开文件和设置窗口主卡片消费的阴影变量。默认值引用 `--panel-shadow`，有效主题为暗色时覆盖为已验收的中性黑色双层阴影。

优点：

- 两个目标选择器只维护一份暗色参数；
- 明亮主题完全继承现状；
- 不改变通用 design token；
- 不影响内部控件和其他卡片；
- 后续两个主卡片不会产生阴影漂移。

### 方案 B：分别覆盖两个选择器

分别为 `.open-file-window` 和 `.settings-window-frame` 编写暗色规则。结果可用，但会重复同一组参数，后续调整容易不一致。

### 方案 C：直接修改暗色 `panelShadow`

代码最少，但会改变通用 token 的语义和潜在使用范围，也会同步影响原型或未来新增的消费者，不符合本次精准局部修改约束。

## 5. CSS 设计

在现有全局窗口尺寸变量附近定义默认值：

```css
--window-main-card-shadow: var(--panel-shadow);
```

仅在根节点的有效暗色主题下覆盖：

```css
:root[data-theme-effective-mode="dark"] {
  --window-main-card-shadow:
    0 0 24px -8px rgb(0 0 0 / 52%),
    0 0 8px -2px rgb(0 0 0 / 34%);
}
```

两个目标主卡片统一消费：

```css
.open-file-window,
.settings-window-frame {
  box-shadow: var(--window-main-card-shadow);
}
```

现有两个选择器的其他声明保持不变。阅读窗口继续使用自己的 `--reader-card-shadow`，本次不重构或合并其变量。

## 6. 测试与运行时验证

### 静态回归

先增加失败测试，要求：

- 默认共享变量引用 `--panel-shadow`；
- 暗色根选择器提供精确的两层黑色零偏移阴影；
- `.open-file-window` 与 `.settings-window-frame` 均消费该共享变量；
- 两个卡片现有的 inset、圆角和边框约束仍然成立。

测试必须先因旧实现仍直接使用 `--panel-shadow` 而失败，再用最小 CSS 修改转为通过。

### 打开文件窗口

增加仓库内稳定的打开文件窗口 QA 入口，使用生产组件和生产 CSS 验证明亮、暗色两个场景：

- 暗色计算阴影包含 `52%` / `34%` 的中性黑色两层值；
- 两层水平和垂直偏移均为 `0px`；
- 明亮计算阴影仍等于 `--panel-shadow`；
- 卡片保持 `18px` 四边 inset、`22px` 圆角和现有边框；
- 保存明亮、暗色截图并人工核对。

### 设置窗口

扩展现有 `pnpm qa:settings-ui`：

- 在明亮和暗色场景读取 `.settings-window-frame` 的计算阴影；
- 暗色值与打开文件窗口及阅读卡片一致；
- 明亮值仍为当前 `--panel-shadow`；
- 卡片尺寸、`18px` inset 和 `22px` 圆角保持不变；
- 人工核对暗色设置窗口截图。

### 完整验证与构建

执行：

```powershell
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm qa:open-file-ui
pnpm qa:settings-ui
pnpm qa:reader-ui
git diff --check
pnpm tauri build --no-bundle --ci
```

构建新的 Windows 测试 EXE，不生成 MSI 或 NSIS 安装包。

## 7. 验收标准

1. 打开文件窗口和设置窗口的主卡片在暗色主题下不再使用原有带方向性的 `panelShadow`。
2. 两张主卡片都使用与阅读卡片相同的中性黑色、零偏移双层阴影。
3. 两张主卡片四周阴影连续、均衡，边界不再出现暖色亮带。
4. 明亮主题视觉保持不变。
5. 内部控件阴影保持不变。
6. 卡片宽高、位置、四边 inset、圆角、边框和内部布局保持不变。
