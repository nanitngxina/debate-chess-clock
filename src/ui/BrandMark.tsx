interface BrandMarkProps {
  size?: number;
  className?: string;
}

/**
 * 「八角笼」的几何化标识：八边形外框 + 内框，模拟擂台/笼子的俯视结构。
 * 纯描边、单色（currentColor），不使用渐变或发光。
 */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M28.01 20.98 L20.98 28.01 L11.02 28.01 L3.99 20.98 L3.99 11.02 L11.02 3.99 L20.98 3.99 L28.01 11.02 Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
      <path
        d="M22.01 18.49 L18.49 22.01 L13.51 22.01 L9.99 18.49 L9.99 13.51 L13.51 9.99 L18.49 9.99 L22.01 13.51 Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="miter"
        opacity="0.45"
      />
    </svg>
  );
}
