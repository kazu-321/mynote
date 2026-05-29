import { z } from "zod";

const pointSchema = z.object({ x: z.number(), y: z.number() });
const baseElementSchema = z.object({
  id: z.string(),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  zIndex: z.number(),
  locked: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const textElementSchema = baseElementSchema.extend({
  type: z.literal("text"),
  content: z.string(),
  format: z.union([z.literal("plain"), z.literal("markdown"), z.literal("tex"), z.literal("markdown-tex")]),
  style: z.object({
    fontSize: z.number(),
    color: z.string(),
    backgroundColor: z.string(),
    padding: z.number(),
    fontFamily: z.string().optional(),
    borderColor: z.string().optional(),
    borderWidth: z.number().optional(),
  }),
});

const imageElementSchema = baseElementSchema.extend({
  type: z.literal("image"),
  src: z.string(),
  sourceType: z.union([z.literal("image"), z.literal("pdf-page")]),
  originalFileName: z.string().optional(),
  pageNumber: z.number().optional(),
  importInfo: z.object({
    importedAt: z.string(),
    pdfScale: z.number().optional(),
    transparentBackgroundApplied: z.boolean().optional(),
    perspectiveTransformApplied: z.boolean().optional(),
  }).optional(),
});

const freehandElementSchema = baseElementSchema.extend({
  type: z.literal("freehand"),
  points: z.array(pointSchema),
  stroke: z.string(),
  strokeWidth: z.number(),
});

const lineElementSchema = baseElementSchema.extend({
  type: z.literal("line"),
  start: pointSchema,
  end: pointSchema,
  stroke: z.string(),
  strokeWidth: z.number(),
});

const rectElementSchema = baseElementSchema.extend({
  type: z.literal("rect"),
  fill: z.string(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
});

const ellipseElementSchema = baseElementSchema.extend({
  type: z.literal("ellipse"),
  fill: z.string(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
});

const canvasElementSchema = z.union([
  textElementSchema,
  imageElementSchema,
  freehandElementSchema,
  lineElementSchema,
  rectElementSchema,
  ellipseElementSchema,
]);

export const manifestSchema = z.object({
  schemaVersion: z.number().int(),
  appName: z.string(),
  appVersion: z.string(),
  subjectOrder: z.array(z.string()),
  subjects: z.array(z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
  })),
});

export const subjectSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string(),
  name: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  noteOrder: z.array(z.string()),
  notes: z.array(z.object({
    id: z.string(),
    title: z.string(),
    metaPath: z.string(),
    notePath: z.string(),
  })),
});

export const noteMetaSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string(),
  subjectId: z.string(),
  title: z.string(),
  description: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  thumbnail: z.string().optional(),
});

export const noteSchema = z.object({
  schemaVersion: z.number().int(),
  id: z.string(),
  subjectId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  canvas: z.object({
    type: z.literal("infinite"),
    viewport: z.object({ x: z.number(), y: z.number(), scale: z.number() }),
    grid: z.object({
      mode: z.union([z.literal("free"), z.literal("assisted")]),
      snapStep: z.number(),
      gridSize: z.number(),
    }),
    elements: z.array(canvasElementSchema),
  }),
});

export { canvasElementSchema };
