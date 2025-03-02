import React, { FC } from 'react'

import NextHead from 'next/head'

import { MetaTags } from '@/components/ui/meta-tags'

type Props = {
  title: string
  description: string
  path: string
}

export const Head: FC<Props> = ({ title, description, path }) => {
  return (
    <NextHead data-testid="head">
      <title>{title}</title>
      <MetaTags path={path} description={description} title={title} />
    </NextHead>
  )
}