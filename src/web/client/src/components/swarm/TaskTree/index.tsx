import React from 'react';
import { TaskNodeComponent, TaskNode } from './TaskNode';
import styles from './TaskTree.module.css';

export interface TaskTreeProps {
  root: TaskNode;
  selectedTaskId?: string;
  onTaskSelect?: (taskId: string) => void;
}

export const TaskTree: React.FC<TaskTreeProps> = ({
  root,
  selectedTaskId,
  onTaskSelect,
}) => {
  return (
    <div className={styles.taskTree}>
      <TaskNodeComponent
        node={root}
        level={0}
        selectedTaskId={selectedTaskId}
        onTaskSelect={onTaskSelect}
      />
    </div>
  );
};

export type { TaskNode };
export { TaskNodeComponent };
