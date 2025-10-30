type TaskStatus = 'pending' | 'leased' | 'done' | 'failed';

interface UserTask {
  taskId: string;
  type: 'SWAP' | 'ADD_LIQUDITY' | 'REMOVE_LIQUDITY' | string;
  payload: Record<string, any>;

  status: TaskStatus;
  scheduledAt: Date;

  checks: number;
  attempts: number;
  maxAttempts?: number;
  backoffSec?: number;
  checkIntervalSec?: number;
  priority?: number;

  workerId?: string;
  leaseUntil?: Date;

  condition: string;
  conditionPayload: any;

  maxWaitUntil?: Date;

  createdAt: Date;
  updatedAt: Date;
}

interface UserDoc {
  id: string;
  tasks: UserTask[];
}