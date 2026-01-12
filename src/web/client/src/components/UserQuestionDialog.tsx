import { useState } from 'react';
import type { UserQuestion } from '../types';

interface UserQuestionDialogProps {
  question: UserQuestion;
  onAnswer: (answer: string) => void;
}

export function UserQuestionDialog({ question, onAnswer }: UserQuestionDialogProps) {
  const [answer, setAnswer] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const handleOptionChange = (optionLabel: string, isMultiSelect?: boolean) => {
    if (isMultiSelect) {
      setSelectedOptions(prev =>
        prev.includes(optionLabel)
          ? prev.filter(o => o !== optionLabel)
          : [...prev, optionLabel]
      );
    } else {
      setSelectedOptions([optionLabel]);
    }
  };

  const handleSubmit = () => {
    let finalAnswer = '';
    if (question.options) {
      finalAnswer = question.multiSelect
        ? selectedOptions.join(',')
        : selectedOptions[0] || '';
    } else {
      finalAnswer = answer;
    }
    onAnswer(finalAnswer);
  };

  const handleSkip = () => {
    onAnswer('');
  };

  const isValid = question.options
    ? selectedOptions.length > 0
    : answer.trim().length > 0;

  return (
    <div className="question-dialog-overlay">
      <div className="question-dialog">
        <div className="question-header">
          <h3>❓ {question.header || '请回答问题'}</h3>
        </div>
        <div className="question-content">
          <p className="question-text">{question.question}</p>
          {question.options && (
            <div className="question-options">
              {question.options.map((opt, i) => (
                <label
                  key={i}
                  className={`question-option ${selectedOptions.includes(opt.label) ? 'selected' : ''}`}
                  onClick={() => handleOptionChange(opt.label, question.multiSelect)}
                >
                  <input
                    type={question.multiSelect ? 'checkbox' : 'radio'}
                    name="question-answer"
                    value={opt.label}
                    checked={selectedOptions.includes(opt.label)}
                    onChange={() => {}}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="question-option-content">
                    <div className="question-option-label">{opt.label}</div>
                    {opt.description && (
                      <div className="question-option-description">{opt.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
          {!question.options && (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="请输入您的回答..."
              autoFocus
            />
          )}
        </div>
        <div className="question-actions">
          <button onClick={handleSkip}>跳过</button>
          <button onClick={handleSubmit} disabled={!isValid}>提交</button>
        </div>
        {question.timeout && (
          <div className="question-timeout-hint">
            超时时间: {Math.round(question.timeout / 1000)}秒
          </div>
        )}
      </div>
    </div>
  );
}
