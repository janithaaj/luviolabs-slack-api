import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type WorkTypeIcon = 'bug' | 'feature' | 'story' | 'task' | 'custom';

@Schema({ _id: false })
export class WorkType {
  @Prop({ required: true, maxlength: 64 })
  id!: string;

  @Prop({ required: true, maxlength: 80 })
  name!: string;

  @Prop({ required: true, maxlength: 32 })
  color!: string;

  @Prop({
    required: true,
    enum: ['bug', 'feature', 'story', 'task', 'custom'],
  })
  icon!: WorkTypeIcon;

  @Prop({ default: false })
  builtin!: boolean;

  @Prop({ default: 0 })
  sortOrder!: number;
}

export const WorkTypeSchema = SchemaFactory.createForClass(WorkType);

export const DEFAULT_WORK_TYPES: WorkType[] = [
  {
    id: 'BUG',
    name: 'Bug',
    color: '#4a154b',
    icon: 'bug',
    builtin: true,
    sortOrder: 1000,
  },
  {
    id: 'FEATURE',
    name: 'Feature',
    color: '#1264a3',
    icon: 'feature',
    builtin: true,
    sortOrder: 2000,
  },
  {
    id: 'STORY',
    name: 'Story',
    color: '#7b2d8e',
    icon: 'story',
    builtin: true,
    sortOrder: 3000,
  },
  {
    id: 'TASK',
    name: 'Task',
    color: '#611f69',
    icon: 'task',
    builtin: true,
    sortOrder: 4000,
  },
];
