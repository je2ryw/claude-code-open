/**
 * FileDialog 使用示例
 *
 * 这个文件展示如何使用 FileDialog 组件
 */

import { useState } from 'react';
import { FileDialog, DialogType } from './index';

/**
 * FileDialog 使用示例组件
 */
export function FileDialogExample() {
  // 对话框状态
  const [dialogState, setDialogState] = useState<{
    visible: boolean;
    type: DialogType;
    initialValue?: string;
    targetName?: string;
  }>({
    visible: false,
    type: 'newFile',
    initialValue: '',
  });

  // 打开新建文件对话框
  const openNewFileDialog = () => {
    setDialogState({
      visible: true,
      type: 'newFile',
      initialValue: '',
    });
  };

  // 打开新建文件夹对话框
  const openNewFolderDialog = () => {
    setDialogState({
      visible: true,
      type: 'newFolder',
      initialValue: '',
    });
  };

  // 打开重命名对话框
  const openRenameDialog = () => {
    setDialogState({
      visible: true,
      type: 'rename',
      initialValue: 'old-file-name.ts',
    });
  };

  // 打开删除确认对话框
  const openDeleteDialog = () => {
    setDialogState({
      visible: true,
      type: 'delete',
      targetName: 'important-file.ts',
    });
  };

  // 关闭对话框
  const closeDialog = () => {
    setDialogState(prev => ({ ...prev, visible: false }));
  };

  // 处理确认
  const handleConfirm = (value: string) => {
    switch (dialogState.type) {
      case 'newFile':
        console.log('创建文件:', value);
        break;
      case 'newFolder':
        console.log('创建文件夹:', value);
        break;
      case 'rename':
        console.log('重命名为:', value);
        break;
      case 'delete':
        console.log('确认删除');
        break;
    }
    closeDialog();
  };

  // 自定义验证（示例：禁止特定名称）
  const customValidate = (value: string): string | null => {
    if (value.toLowerCase() === 'test') {
      return '名称 "test" 已被占用';
    }
    return null;
  };

  return (
    <div
      style={{
        padding: 20,
        background: '#1e1e1e',
        minHeight: '100vh',
        color: '#ccc',
      }}
    >
      <h2 style={{ color: '#fff', marginBottom: 20 }}>FileDialog 示例</h2>

      <p style={{ marginBottom: 20 }}>
        点击下面的按钮打开不同类型的对话框：
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={openNewFileDialog}
          style={{
            padding: '8px 16px',
            background: '#0e639c',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          新建文件
        </button>

        <button
          onClick={openNewFolderDialog}
          style={{
            padding: '8px 16px',
            background: '#0e639c',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          新建文件夹
        </button>

        <button
          onClick={openRenameDialog}
          style={{
            padding: '8px 16px',
            background: '#ce9178',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          重命名
        </button>

        <button
          onClick={openDeleteDialog}
          style={{
            padding: '8px 16px',
            background: '#f14c4c',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          删除
        </button>
      </div>

      <div style={{ marginTop: 20, color: '#808080' }}>
        <p>提示：</p>
        <ul>
          <li>在输入框中输入 &quot;test&quot; 会触发自定义验证错误</li>
          <li>按 Enter 键确认，按 Escape 键取消</li>
          <li>点击遮罩层也可以关闭对话框</li>
        </ul>
      </div>

      {/* 文件对话框 */}
      <FileDialog
        visible={dialogState.visible}
        type={dialogState.type}
        initialValue={dialogState.initialValue}
        targetName={dialogState.targetName}
        currentPath="/src/components"
        onConfirm={handleConfirm}
        onCancel={closeDialog}
        validate={customValidate}
      />
    </div>
  );
}
