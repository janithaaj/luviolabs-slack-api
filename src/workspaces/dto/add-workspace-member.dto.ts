import { IsEmail, IsIn } from 'class-validator';

export class AddWorkspaceMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(['ADMIN', 'MEMBER'])
  role!: 'ADMIN' | 'MEMBER';
}
