import { FC, HTMLAttributes, PropsWithChildren, useEffect } from 'react'

import { Navbar } from '@/components/ui/navbar'

interface Props extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {}

export const Layout: FC<Props> = ({ children, ...props }) => {
  useEffect(() => {
    const hash = window.location.hash
    if (hash) {
      const element: HTMLElement | null = document.querySelector(hash)
      if (element) {
        element.style.scrollMarginTop = '104px'
      }
    }
  }, [])
  return (
    <div className="line-numbers relative overflow-x-hidden text-primary" {...props}>
      <div className="fixed z-40 w-full border-b border-solid border-stone-200">
        <Navbar />
      </div>
      <div className="line-numbers container m-auto mt-[75px] w-full overflow-x-hidden overflow-y-scroll px-4 sm:mt-[100px] lg:px-2">
        {children}
      </div>
    </div>
  )
}