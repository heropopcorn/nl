import { useEffect, useId, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: number;
  onValueChange: (value: number) => boolean | void;
};

/** Keep incomplete numeric text local; never turn a cleared field into zero. */
export function NumberField({ value, onValueChange, onBlur, step = 'any', ...props }: Props) {
  const [draft, setDraft] = useState(String(value)), [invalid, setInvalid] = useState(false);
  const errorId = useId();
  useEffect(() => { setDraft(String(value)); setInvalid(false); }, [value]);
  return <><input {...props} type="number" step={step} value={draft} aria-invalid={invalid || undefined}
    aria-describedby={invalid ? [props['aria-describedby'], errorId].filter(Boolean).join(' ') : props['aria-describedby']}
    onChange={event => {
      const input = event.currentTarget, text = input.value;
      setDraft(text);
      if (!text.trim() || !Number.isFinite(input.valueAsNumber) || !input.validity.valid) { setInvalid(true); return; }
      setInvalid(onValueChange(input.valueAsNumber) === false);
    }}
    onBlur={event => { setDraft(String(value)); setInvalid(false); onBlur?.(event); }}/>
    {invalid && <small id={errorId} className="field-error" aria-hidden="true">请输入范围内的有效数值；离开输入框会恢复最后有效值。</small>}
  </>;
}
