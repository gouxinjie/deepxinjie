# 文件与图片功能实现备忘录 (File & Image Memo)

## 1. 文档对话 (Document Chat)
### 实现方案
- **上传**：前端 `ChatInput` 触发文件上传，存储到 `backend/uploads` 目录，并在 `file_upload` 表记录信息。
- **解析**：
  - PDF: `pdfplumber` 或 `PyPDF2`
  - Word: `python-docx`
  - Excel: `pandas`
- **上下文注入**：将解析出的文本按格式拼接：`"以下是用户上传的文档内容：\n{file_content}\n\n用户的问题是：{user_query}"`。

### 限制
- DeepSeek 上下文上限为 128K，超大文件需做文本分段 (Chunking) 和向量检索。

## 2. 图片识别 (Vision)
### 现状
- 当前 DeepSeek API (V3/R1) 不直接支持图像输入。

### 进阶方案 (如有强需求)
- **OCR 方式**：使用 `PaddleOCR` 或 `Tesseract` 提取图片文字，作为文本传给模型。
- **混合模型**：前端上传图片后，后端先调用带 Vision 能力的模型（如 GPT-4o-mini 或 Gemini-1.5-flash）生成图片描述，再将描述传给 DeepSeek 进行逻辑分析。

## 3. 待办清单 (TODO)
- [ ] 开发前端 `FileUploader` 组件，支持拖拽和进度显示。
- [ ] 后端新增 `/api/file/upload` 接口，处理文件存储。
- [ ] 集成文本解析库，在 `generate_response` 中读取已上传文件的内容。
- [ ] 在 `ChatMessage` 中增加文件附件的展示卡片。
