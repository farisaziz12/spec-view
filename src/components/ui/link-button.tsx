import React, { AnchorHTMLAttributes, FC, PropsWithChildren } from 'react'

import Link from 'next/link'

type ButtonVariant = 'primary' | 'secondary' | 'secondary-outline' | 'primary-outline'

interface Props extends PropsWithChildren, AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  variant?: ButtonVariant
  hasShadow?: boolean
}

export const getVariant = (variant?: ButtonVariant) => {
  switch (variant) {
    case 'secondary':
      return `bg-white text-black-default`
    case 'secondary-outline':
      return 'bg-white text-black-default border-black-default border'
    case 'primary-outline':
      return 'bg-black-300 sm:bg-black-default text-white border-white border'
    default:
      return `bg-black-default text-white`
  }
}

export const LinkButton: FC<Props> = ({ children, href = '/', hasShadow = false, className, variant, ...props }) => {
  const variantClass = getVariant(variant)
  const shadowClass = hasShadow ? 'shadow-lg' : ''

  return (
    <Link
      href={href}
      className={`rounded-full py-5 px-8 text-center text-sm capitalize sm:px-14 ${shadowClass} ${variantClass} ${className}`}
      {...props}
      data-testid="link-button"
    >
      {children}
    </Link>
  )
}