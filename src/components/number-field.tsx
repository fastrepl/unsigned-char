import { Minus, Plus } from "lucide-react";
import {
  createContext,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  useContext,
  useState,
} from "react";

import { Button, cn } from "./ui";

type NumberFieldValue = number | null;

type NumberFieldContextValue = {
  adjustValue: (direction: -1 | 1) => void;
  disabled: boolean;
  max: number | undefined;
  min: number | undefined;
  setValue: (value: NumberFieldValue) => void;
  step: number;
  value: NumberFieldValue;
};

const NumberFieldContext = createContext<NumberFieldContextValue | null>(null);

function useNumberFieldContext(componentName: string) {
  const context = useContext(NumberFieldContext);

  if (!context) {
    throw new Error(`${componentName} must be used within NumberField.`);
  }

  return context;
}

function clampValue(value: NumberFieldValue, min?: number, max?: number) {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  let nextValue = value;

  if (typeof min === "number") {
    nextValue = Math.max(min, nextValue);
  }

  if (typeof max === "number") {
    nextValue = Math.min(max, nextValue);
  }

  return nextValue;
}

type NumberFieldProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  defaultValue?: number;
  disabled?: boolean;
  max?: number;
  min?: number;
  onValueChange?: (value: NumberFieldValue) => void;
  step?: number;
  value?: NumberFieldValue;
};

export function NumberField({
  children,
  className,
  defaultValue,
  disabled = false,
  max,
  min,
  onValueChange,
  step = 1,
  value,
  ...props
}: NumberFieldProps) {
  const isControlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState<NumberFieldValue>(
    defaultValue ?? null,
  );
  const resolvedStep = step > 0 ? step : 1;
  const currentValue = isControlled ? (value ?? null) : uncontrolledValue;

  const setValue = (nextValue: NumberFieldValue) => {
    const normalizedValue = clampValue(nextValue, min, max);

    if (!isControlled) {
      setUncontrolledValue(normalizedValue);
    }

    onValueChange?.(normalizedValue);
  };

  const adjustValue = (direction: -1 | 1) => {
    const baseValue = currentValue ?? min ?? 0;
    const nextValue = currentValue === null ? baseValue : currentValue + direction * resolvedStep;
    setValue(nextValue);
  };

  return (
    <NumberFieldContext.Provider
      value={{
        adjustValue,
        disabled,
        max,
        min,
        setValue,
        step: resolvedStep,
        value: currentValue,
      }}
    >
      <div {...props} className={cn("w-full", className)}>
        {children}
      </div>
    </NumberFieldContext.Provider>
  );
}

export function NumberFieldGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "flex h-11 items-stretch overflow-hidden rounded-[calc(var(--radius)-6px)] border border-[color:var(--border-strong)] bg-[color:var(--input)] shadow-[0_1px_0_rgba(255,255,255,0.85)]",
        className,
      )}
    />
  );
}

type NumberFieldStepButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  direction: -1 | 1;
};

function NumberFieldStepButton({
  className,
  direction,
  disabled,
  ...props
}: NumberFieldStepButtonProps) {
  const { adjustValue, disabled: contextDisabled, max, min, value } = useNumberFieldContext(
    direction === 1 ? "NumberFieldIncrement" : "NumberFieldDecrement",
  );
  const reachedMinimum = typeof min === "number" && value !== null && value <= min;
  const reachedMaximum = typeof max === "number" && value !== null && value >= max;
  const buttonDisabled =
    disabled || contextDisabled || (direction === -1 ? reachedMinimum : reachedMaximum);

  return (
    <Button
      type="button"
      {...props}
      variant="ghost"
      size="icon"
      disabled={buttonDisabled}
      className={cn(
        "h-full w-11 rounded-none bg-transparent px-0 text-zinc-500 shadow-none hover:bg-[color:var(--secondary)] hover:text-zinc-950 data-pressed:bg-[color:var(--secondary)] data-pressed:text-zinc-950 focus-visible:ring-[color:var(--ring)] focus-visible:ring-inset disabled:text-zinc-300",
        className,
      )}
      onClick={() => {
        adjustValue(direction);
      }}
    >
      {direction === 1 ? (
        <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <Minus className="size-4" strokeWidth={1.8} aria-hidden="true" />
      )}
    </Button>
  );
}

export function NumberFieldDecrement(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <NumberFieldStepButton aria-label="Decrease value" direction={-1} {...props} />;
}

export function NumberFieldIncrement(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <NumberFieldStepButton aria-label="Increase value" direction={1} {...props} />;
}

export function NumberFieldInput({
  className,
  disabled,
  inputMode = "numeric",
  onChange,
  onKeyDown,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value">) {
  const { adjustValue, disabled: contextDisabled, setValue, value } =
    useNumberFieldContext("NumberFieldInput");

  return (
    <input
      {...props}
      type="text"
      inputMode={inputMode}
      pattern="[0-9]*"
      disabled={disabled || contextDisabled}
      value={value ?? ""}
      onChange={(event) => {
        onChange?.(event);

        if (event.defaultPrevented) {
          return;
        }

        const rawValue = event.target.value;

        if (!/^\d*$/.test(rawValue)) {
          return;
        }

        if (rawValue.length === 0) {
          setValue(null);
          return;
        }

        setValue(Number.parseInt(rawValue, 10));
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);

        if (event.defaultPrevented) {
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          adjustValue(1);
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          adjustValue(-1);
        }
      }}
      className={cn(
        "min-w-0 flex-1 border-x border-[color:var(--border)] bg-transparent px-3 text-center text-sm text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-100 disabled:text-zinc-400 disabled:placeholder:text-zinc-400",
        className,
      )}
    />
  );
}
