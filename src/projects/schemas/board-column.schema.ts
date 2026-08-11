import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type BoardColumnCategory =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'BLOCKED'
  | 'DONE';

@Schema({ _id: false })
export class BoardColumn {
  @Prop({ required: true, maxlength: 64 })
  id!: string;

  @Prop({ required: true, maxlength: 80 })
  name!: string;

  @Prop({
    required: true,
    enum: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'],
  })
  category!: BoardColumnCategory;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ maxlength: 32 })
  color?: string;

  @Prop({ min: 0 })
  wipLimit?: number;
}

export const BoardColumnSchema = SchemaFactory.createForClass(BoardColumn);

export const DEFAULT_BOARD_COLUMNS: BoardColumn[] = [
  { id: 'TODO', name: 'To Do', category: 'TODO', sortOrder: 1000, color: '#6b7280' },
  {
    id: 'IN_PROGRESS',
    name: 'In Progress',
    category: 'IN_PROGRESS',
    sortOrder: 2000,
    color: '#2563eb',
  },
  {
    id: 'IN_REVIEW',
    name: 'In Review',
    category: 'IN_REVIEW',
    sortOrder: 3000,
    color: '#7c3aed',
  },
  {
    id: 'BLOCKED',
    name: 'Blocked',
    category: 'BLOCKED',
    sortOrder: 4000,
    color: '#b45309',
  },
  { id: 'DONE', name: 'Done', category: 'DONE', sortOrder: 5000, color: '#15803d' },
];
