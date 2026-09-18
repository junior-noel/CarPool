import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  //Unique user identifier
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  //Unique login email
  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  phoneNumber: string;

  //User role, initially passenger
  @Column({ default: 'passenger' })
  role: string;

  //Account creation date
  @CreateDateColumn()
  createdAt: Date;

  //Last update date
  @UpdateDateColumn()
  updatetedAt: Date;
}
