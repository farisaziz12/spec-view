import React, { FC } from 'react'

interface Props {
  title: string
  description: string
  ctas: React.ReactElement[]
}

export const Banner: FC<Props> = ({ title, description, ctas }) => {
  return (
    <div
      className="radial-gradient-hero 2xl:h[510px] flex h-[360px] min-w-[327px] place-content-center items-center justify-center rounded-3xl bg-dark-purple p-4 md:h-[350px] lg:h-[360px]"
      data-testid="banner"
    >
      <div className="xl:banner-content-xl relative grid place-items-center text-center lg:w-banner-content-lg xl:w-banner-content-xl">
        <h1 className="min-w-11/12 mb-4 text-heading3 font-medium leading-8 text-white md:text-heading2 md:leading-10 lg:w-banner-content-lg lg:text-heading1 xl:w-banner-content-xl xl:text-6xl">
          {title}
        </h1>
        <span className="mb-8 px-6 text-body font-light leading-6 text-white md:mb-14 md:text-2xl md:text-heading5 md:leading-6 xl:text-2xl">
          {description}
        </span>
        <div className="">{ctas}</div>
      </div>
    </div>
  )
}