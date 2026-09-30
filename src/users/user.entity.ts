import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

// @Entity tells TypeORM that this class represents a database table.
// The table will be named "users".
@Entity('users')
export class User {
  // Automatically generates a unique ID for every user.
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  //Unique login email
  @Index({ unique: true })
  @Column()
  email: string;

  @Column()
  password: string;

  @Column()
  phoneNumber: string;

  //Defines the user's role in the system., initially a normal user wth no drver nor passenger acty
  @Column({ default: 'user' })
  role: string;

  // Automatically stores the date and time when the user is created.
  @CreateDateColumn()
  createdAt: Date;

  // Automatically updates whenever the user record changes.
  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  //for otp
  // Indicates whether the user has successfully verified their email.
  @Column({ default: false })
  emailVerified: boolean;
}
