# Markdown Syntax Test

这个文件用于测试 Markdown 阅读器的解析与渲染能力。

说明：

- 第 1 至第 11 节覆盖 CommonMark / 标准 Markdown 的核心语法。
- 第 12 节覆盖常见扩展语法，例如 GFM 表格、任务列表、删除线和脚注。
- 第 13 节覆盖本项目阅读器可能需要支持的扩展内容，例如数学公式和代码高亮。

---

## 1. 标题

# 一级标题 H1

## 二级标题 H2

### 三级标题 H3

#### 四级标题 H4

##### 五级标题 H5

###### 六级标题 H6

Setext 一级标题
===============

Setext 二级标题
---------------

---

## 2. 段落、软换行与硬换行

这是一个普通段落。Markdown 会把连续文本合并为一个段落，段落之间使用空行分隔。

这是第二个段落，包含中文、English text、数字 12345，以及常见标点：逗号、句号、括号、引号、斜杠 / 和反斜杠 \。

这一行后面没有硬换行。
这一行在标准 Markdown 中通常会作为同一个段落的软换行显示。

这一行使用显式 `<br>` 产生硬换行。<br>
这一行应当产生硬换行。

这一行用反斜杠结尾\
这一行也应当产生硬换行。

---

## 3. 强调、加粗、组合强调与删除线

这是 *星号斜体*，这是 _下划线斜体_。

这是 **星号加粗**，这是 __下划线加粗__。

这是 ***加粗并斜体***，这是 ___另一种加粗并斜体___。

普通文本中可以混合 **加粗、*嵌套斜体* 和普通文本**。

反斜杠转义：\*这不是斜体\*，\_\_这不是加粗\_\_，\[这不是链接\]\(https://example.com\)。

常见扩展删除线：~~这段文字应显示为删除线~~。

---

## 4. 行内代码与代码块

行内代码示例：`const answer = 42`。

行内代码中包含反引号：``Use `backticks` inside inline code``。

缩进代码块：

    const mode = "indented-code-block";
    console.log(mode);

围栏代码块：

```text
plain text fenced code block
line 2
```

带语言标记的 TypeScript 代码块：

```ts
type ThemeMode = "light" | "dark" | "system";

interface ReaderSettings {
  themeMode: ThemeMode;
  contentFont: string;
  codeFont: string;
}

const defaultSettings: ReaderSettings = {
  themeMode: "system",
  contentFont: "Maple Mono NF CN",
  codeFont: "Maple Mono NF CN",
};
```

带语言标记的 Rust 代码块：

```rust
#[derive(Debug, Clone)]
struct ReadingPosition {
    file_path: String,
    scroll_ratio: f64,
}

fn clamp_ratio(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}
```

波浪线围栏代码块：

~~~json
{
  "schemaVersion": 1,
  "themeMode": "system",
  "safeHtml": true
}
~~~

---

## 5. 引用块

> 这是一级引用。
>
> 引用中可以包含第二个段落。

> 这是一级引用。
>
> > 这是嵌套引用。
> >
> > - 嵌套引用里的列表项 A
> > - 嵌套引用里的列表项 B
>
> 回到一级引用。

> 引用中包含代码：
>
> ```js
> console.log("quoted code block");
> ```

---

## 6. 列表

无序列表，使用短横线：

- 苹果
- 香蕉
- 橙子

无序列表，使用星号：

* Alpha
* Beta
* Gamma

无序列表，使用加号：

+ Red
+ Green
+ Blue

有序列表：

1. 第一步
2. 第二步
3. 第三步

从非 1 数字开始的有序列表：

3. 第三项
4. 第四项
5. 第五项

嵌套列表：

1. 外层第一项
   - 内层无序项 A
   - 内层无序项 B
     1. 更深一层的有序项
     2. 更深一层的第二项
2. 外层第二项
   1. 内层有序项 A
   2. 内层有序项 B

包含多段内容的列表项：

- 第一项的第一段。

  第一项的第二段。

  ```txt
  第一项中的代码块
  ```

- 第二项。

---

## 7. 链接与自动链接

行内链接：[CommonMark](https://commonmark.org/ "CommonMark 官网")。

相对链接：[技术架构文档](./technical-architecture.md)。

引用式链接：[项目路线图][roadmap-link]。

折叠引用式链接：[实施工作列表][]。

快捷引用式链接：[CommonMark Spec]。

自动 URL：<https://example.com/path?query=markdown#fragment>

自动邮箱：<reader@example.com>

裸 URL（部分扩展会自动链接）：https://example.org/markdown-test

---

## 8. 图片

行内图片，使用 1x1 PNG data URI：

![一个 1x1 PNG 测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII= "Tiny PNG")

引用式图片：

![引用式 1x1 PNG 测试图片][tiny-png]

相对路径图片语法测试：

![相对路径图片 alt 文本](./assets/example-image.png "Relative image title")

---

## 9. 分隔线

下面是三个短横线：

---

下面是三个星号：

***

下面是三个下划线：

___

---

## 10. HTML、实体与注释

行内 HTML：按下 <kbd>Ctrl</kbd> + <kbd>O</kbd> 打开文件。

HTML 实体：&copy; &amp; &lt; &gt; &quot; &#169;

HTML 注释如下，正常渲染时不应显示：

<!-- 这是一段 Markdown 测试文件中的 HTML 注释。 -->

HTML 块：

<div class="markdown-test-box">
  <strong>这是一个原始 HTML 块。</strong>
  <p>它用于测试渲染器是否按安全策略处理 HTML。</p>
</div>

折叠详情 HTML：

<details>
<summary>点击展开详情</summary>

这里是 details 内部的文本。不同 Markdown 引擎对 HTML 块内部 Markdown 的解析策略可能不同。

</details>

---

## 11. 特殊字符与转义

需要转义的 Markdown 字符：

\# 不是标题

\- 不是列表

\+ 不是列表

\> 不是引用

\`不是代码\`

\| 不是表格分隔符

反斜杠本身：`C:\Users\Name\Documents\file.md`

尖括号文本：`<not-an-html-tag>`

---

## 12. 常见扩展语法

### 12.1 GFM 表格

| 功能 | 状态 | 说明 |
| --- | :---: | ---: |
| 标题 | 通过 | 左对齐列 |
| 居中 | 通过 | 右侧列右对齐 |
| **加粗内容** | `inline code` | 123.45 |
| 中文内容 | 支持 | 需要检查列宽 |

包含长内容的表格：

| 类型 | 内容 |
| --- | --- |
| 长英文 | ThisIsAVeryLongUnbrokenStringUsedToTestOverflowBehaviorInMarkdownTables |
| 长中文 | 这是一段很长很长很长很长很长很长很长很长的中文内容，用来测试表格换行和横向滚动。 |
| 代码 | `pnpm tauri dev -- --example markdown-reader` |

### 12.2 GFM 任务列表

- [x] 已完成任务
- [ ] 未完成任务
- [x] 包含 **加粗文本** 的任务
- [ ] 包含 `inline code` 的任务

### 12.3 脚注

这里有一个脚注引用。[^basic-footnote]

这里有另一个较长的脚注引用。[^long-footnote]

### 12.4 定义列表

Markdown
: 一种轻量级标记语言。

CommonMark
: 对 Markdown 语法进行明确化的规范。

GFM
: GitHub Flavored Markdown，包含表格、任务列表、删除线等扩展。

---

## 13. 项目扩展内容

这些内容不是标准 Markdown 的核心语法，但对本项目的 Markdown 阅读器测试有实际价值。

### 13.1 数学公式

行内公式：$E = mc^2$。

块级公式：

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

多行公式：

$$
\begin{aligned}
a^2 + b^2 &= c^2 \\
\nabla \cdot \vec{E} &= \frac{\rho}{\varepsilon_0}
\end{aligned}
$$

### 13.2 长代码行

```txt
ThisIsAnExtremelyLongLineUsedToTestHorizontalScrollingInCodeBlocks_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789_abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789
```

### 13.3 长公式和长英文文本

长英文单词：

AntidisestablishmentarianismPneumonoultramicroscopicsilicovolcanoconiosisSupercalifragilisticexpialidocious

长公式：

$$
f(x_1, x_2, \ldots, x_n) = \sum_{i=1}^{n} \left(\frac{x_i^2 + 2x_i + 1}{\sqrt{x_i^2 + 1}}\right) \cdot \prod_{j=1}^{i} \left(1 + \frac{1}{j^2}\right)
$$

---

## 14. 参考定义

[roadmap-link]: ./feature-roadmap.md "Feature Roadmap"
[实施工作列表]: ./implementation-worklist.md
[CommonMark Spec]: https://spec.commonmark.org/
[tiny-png]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII= "Tiny PNG"

[^basic-footnote]: 这是一个简单脚注。

[^long-footnote]: 这是一个较长脚注。它包含多句话，用来测试脚注区域的排版、间距和链接回跳行为。

    脚注中还包含一个缩进代码块。
