import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';


// @Entity tells TypeORM that this class represents a database table.
// The table will be named "users".
@Entity('users')
export class User {
  // Automatically generates a unique ID for every user.
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

  //Defines the user's role in the system., initially passenger
  @Column({ default: 'passenger' })
  role: string;

  // Automatically stores the date and time when the user is created.
  @CreateDateColumn()
  createdAt: Date;

  // Automatically updates whenever the user record changes.
  @UpdateDateColumn()
  updatedAt: Date;
}
