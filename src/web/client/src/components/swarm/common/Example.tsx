/**
 * 动画组件库使用示例
 *
 * 此文件展示了所有动画组件的用法
 * 可以在开发环境中引入此组件进行测试
 */

import React, { useState, useEffect } from 'react';
import {
  ProgressBar,
  StatusBadge,
  AnimatedCheckmark,
  BreathingLight,
  FadeIn,
} from './index';

/**
 * 动画组件展示页面
 */
export const AnimationExamples: React.FC = () => {
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  // 模拟进度条增长
  useEffect(() => {
    if (progress < 100) {
      const timer = setTimeout(() => {
        setProgress(prev => Math.min(prev + 1, 100));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [progress]);

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>动画组件库示例</h1>

      {/* ProgressBar 示例 */}
      <FadeIn delay={0}>
        <section style={{ marginBottom: '40px' }}>
          <h2>1. ProgressBar - 进度条</h2>
          <div style={{ marginBottom: '20px' }}>
            <h3>蓝色进度条（默认）</h3>
            <ProgressBar value={progress} color="blue" showLabel />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <h3>绿色动画进度条</h3>
            <ProgressBar value={75} color="green" animated showLabel />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <h3>黄色警告进度</h3>
            <ProgressBar value={60} color="yellow" />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <h3>红色错误进度</h3>
            <ProgressBar value={30} color="red" animated />
          </div>
        </section>
      </FadeIn>

      {/* StatusBadge 示例 */}
      <FadeIn delay={100}>
        <section style={{ marginBottom: '40px' }}>
          <h2>2. StatusBadge - 状态徽章</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <StatusBadge status="pending" />
            <StatusBadge status="running" pulse />
            <StatusBadge status="success" label="任务完成" />
            <StatusBadge status="error" label="执行失败" />
            <StatusBadge status="warning" label="需要注意" pulse />
          </div>
        </section>
      </FadeIn>

      {/* AnimatedCheckmark 示例 */}
      <FadeIn delay={200}>
        <section style={{ marginBottom: '40px' }}>
          <h2>3. AnimatedCheckmark - 完成动画</h2>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div>
              <p>默认大小（32px）</p>
              <AnimatedCheckmark animate />
            </div>
            <div>
              <p>大号（64px）</p>
              <AnimatedCheckmark size={64} color="#3b82f6" animate />
            </div>
            <div>
              <p>小号（24px）</p>
              <AnimatedCheckmark size={24} color="#f59e0b" animate />
            </div>
          </div>
        </section>
      </FadeIn>

      {/* BreathingLight 示例 */}
      <FadeIn delay={300}>
        <section style={{ marginBottom: '40px' }}>
          <h2>4. BreathingLight - 呼吸灯</h2>
          <div style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <BreathingLight active={true} color="green" size={16} />
              <p style={{ marginTop: '10px' }}>在线</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <BreathingLight active={isRunning} color="blue" size={16} />
              <p style={{ marginTop: '10px' }}>运行中</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <BreathingLight active={true} color="yellow" size={16} />
              <p style={{ marginTop: '10px' }}>警告</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <BreathingLight active={true} color="red" size={16} />
              <p style={{ marginTop: '10px' }}>错误</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <BreathingLight active={false} color="green" size={16} />
              <p style={{ marginTop: '10px' }}>离线</p>
            </div>
          </div>
          <button
            onClick={() => setIsRunning(!isRunning)}
            style={{ marginTop: '20px', padding: '8px 16px' }}
          >
            切换运行状态
          </button>
        </section>
      </FadeIn>

      {/* FadeIn 示例 */}
      <FadeIn delay={400}>
        <section style={{ marginBottom: '40px' }}>
          <h2>5. FadeIn - 淡入动画</h2>
          <p>所有区块都使用了 FadeIn 包装，观察它们的渐进出现效果</p>
          <div style={{ marginTop: '20px' }}>
            {[0, 100, 200, 300, 400].map(delay => (
              <FadeIn key={delay} duration={500} delay={delay}>
                <div
                  style={{
                    padding: '15px',
                    marginBottom: '10px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '8px',
                  }}
                >
                  延迟 {delay}ms 的淡入效果
                </div>
              </FadeIn>
            ))}
          </div>
        </section>
      </FadeIn>

      {/* 组合使用示例 */}
      <FadeIn delay={500}>
        <section style={{ marginBottom: '40px' }}>
          <h2>6. 组合使用示例</h2>
          <div
            style={{
              padding: '20px',
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
              <BreathingLight active={true} color="blue" size={12} />
              <StatusBadge status="running" label="任务执行中" pulse />
            </div>
            <ProgressBar value={progress} color="blue" animated showLabel />
            {progress === 100 && (
              <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AnimatedCheckmark size={24} animate />
                <StatusBadge status="success" label="任务已完成" />
              </div>
            )}
          </div>
        </section>
      </FadeIn>
    </div>
  );
};

export default AnimationExamples;
