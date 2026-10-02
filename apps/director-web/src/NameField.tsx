import { useEffect, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string; onValueChange: (value: string) => boolean | void;
};
export function NameField({ value, onValueChange, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <input {...props} value={draft} onChange={event => {
    const text = event.currentTarget.value; setDraft(text);
    if (text.trim()) onValueChange(text);
  }} onBlur={event => { setDraft(value); onBlur?.(event); }}/>;
}
