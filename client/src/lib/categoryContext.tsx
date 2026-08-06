import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Category } from '../types'
import { buildCategoryIndex, type CategoryIndex, unknownCategory } from './categories'

const CategoryContext = createContext<CategoryIndex>({
  list: [],
  byId: (id) => unknownCategory(id),
})

/**
 * הקטגוריות שייכות למשק הבית ולכן משתנות בזמן ריצה.
 * ההקשר חוסך העברה שלהן דרך כל רכיב ביניים.
 */
export function CategoryProvider({
  categories,
  children,
}: {
  categories: Category[]
  children: ReactNode
}) {
  const index = useMemo(() => buildCategoryIndex(categories), [categories])
  return <CategoryContext.Provider value={index}>{children}</CategoryContext.Provider>
}

export function useCategories(): CategoryIndex {
  return useContext(CategoryContext)
}
