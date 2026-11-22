import {
  StarterKit, Placeholder, TiptapLink, TiptapUnderline, TaskList, TaskItem, HorizontalRule,
  TiptapImage, CustomKeymap, GlobalDragHandle, Command, renderItems, createSuggestionItems
} from "novel";

// itens do menu "/"
export const suggestionItems = createSuggestionItems([
  { title: "Texto", description: "Parágrafo comum.", icon: "¶", searchTerms: ["paragrafo", "p"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").run() },
  { title: "Título 1", description: "Seção grande.", icon: "H1", searchTerms: ["titulo", "h1", "heading"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run() },
  { title: "Título 2", description: "Seção média.", icon: "H2", searchTerms: ["titulo", "h2", "subtitulo"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run() },
  { title: "Título 3", description: "Seção pequena.", icon: "H3", searchTerms: ["titulo", "h3"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run() },
  { title: "Lista", description: "Lista com marcadores.", icon: "•", searchTerms: ["lista", "bullet", "ul"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: "Lista numerada", description: "Lista em ordem.", icon: "1.", searchTerms: ["numerada", "ordenada", "ol"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: "Tarefas", description: "Lista com caixas de seleção.", icon: "[ ]", searchTerms: ["todo", "checklist", "tarefa"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
  { title: "Citação", description: "Trecho em destaque.", icon: "“", searchTerms: ["citacao", "quote"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleNode("paragraph", "paragraph").toggleBlockquote().run() },
  { title: "Código", description: "Bloco de código.", icon: "</>", searchTerms: ["codigo", "code"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { title: "Divisor", description: "Linha horizontal.", icon: "—", searchTerms: ["linha", "hr", "separador"],
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  { title: "Imagem", description: "Imagem a partir de um link.", icon: "img", searchTerms: ["imagem", "foto", "image"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      window.dispatchEvent(new CustomEvent("editor:ask", { detail: { kind: "image" } }));
    } }
]);

export const extensions = [
  StarterKit.configure({
    horizontalRule: false,
    dropcursor: { color: "currentColor", width: 2 },
    heading: { levels: [1, 2, 3] }
  }),
  Placeholder.configure({
    placeholder: ({ node }) => (node.type.name === "heading" ? "Título" : "Escreva, ou digite / para ver os blocos"),
    includeChildren: true
  }),
  TiptapLink.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener", target: "_blank" } }),
  TiptapUnderline,
  TaskList,
  TaskItem.configure({ nested: true }),
  HorizontalRule,
  TiptapImage.configure({ allowBase64: false }),
  CustomKeymap,
  GlobalDragHandle.configure({ dragHandleWidth: 20 }),
  Command.configure({ suggestion: { items: () => suggestionItems, render: renderItems } })
];
