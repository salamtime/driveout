# Loading Skeleton Components

This directory contains reusable skeleton components that provide smooth loading states during data fetching throughout the application.

## Components Overview

### 1. CardSkeleton
A versatile skeleton for card-based layouts with customizable sections.

```jsx
import { CardSkeleton } from './skeletons';

<CardSkeleton 
  showImage={true}
  showTitle={true}
  showDescription={true}
  showActions={true}
  count={3}
  className="custom-class"
/>
```

**Props:**
- `showImage` (boolean): Show image placeholder
- `showTitle` (boolean): Show title placeholder
- `showDescription` (boolean): Show description placeholder
- `showActions` (boolean): Show action buttons placeholder
- `count` (number): Number of skeleton cards to render
- `className` (string): Additional CSS classes

### 2. TableSkeleton
Skeleton component for table layouts with customizable rows and columns.

```jsx
import { TableSkeleton } from './skeletons';

<TableSkeleton 
  rows={5}
  columns={4}
  showHeader={true}
  className="custom-class"
/>
```

**Props:**
- `rows` (number): Number of skeleton rows
- `columns` (number): Number of skeleton columns
- `showHeader` (boolean): Show table header skeleton
- `className` (string): Additional CSS classes

### 3. DashboardSkeleton
Comprehensive skeleton for dashboard layouts with stats, charts, and tables.

```jsx
import { DashboardSkeleton } from './skeletons';

<DashboardSkeleton 
  showStats={true}
  showCharts={true}
  showTables={true}
  className="custom-class"
/>
```

**Props:**
- `showStats` (boolean): Show statistics cards skeleton
- `showCharts` (boolean): Show charts section skeleton
- `showTables` (boolean): Show tables/lists skeleton
- `className` (string): Additional CSS classes

### 4. FormSkeleton
Skeleton for form layouts with multiple sections and fields.

```jsx
import { FormSkeleton } from './skeletons';

<FormSkeleton 
  sections={3}
  fieldsPerSection={3}
  showButtons={true}
  className="custom-class"
/>
```

**Props:**
- `sections` (number): Number of form sections
- `fieldsPerSection` (number): Fields per section
- `showButtons` (boolean): Show action buttons skeleton
- `className` (string): Additional CSS classes

### 5. GridSkeleton
Skeleton for grid layouts using CardSkeleton internally.

```jsx
import { GridSkeleton } from './skeletons';

<GridSkeleton 
  items={6}
  columns={3}
  showImage={true}
  showActions={true}
  className="custom-class"
/>
```

**Props:**
- `items` (number): Number of grid items
- `columns` (number): Grid columns (1-6)
- `showImage` (boolean): Show image in cards
- `showActions` (boolean): Show actions in cards
- `className` (string): Additional CSS classes

## Utility Components

### SkeletonLine
Simple line skeleton with customizable width and height.

```jsx
import { SkeletonLine } from './skeletons';

<SkeletonLine width="75%" height="1rem" className="mb-2" />
```

### SkeletonCircle
Circular skeleton for avatars and icons.

```jsx
import { SkeletonCircle } from './skeletons';

<SkeletonCircle size="3rem" className="mr-3" />
```

### SkeletonButton
Button-shaped skeleton.

```jsx
import { SkeletonButton } from './skeletons';

<SkeletonButton width="120px" className="ml-auto" />
```

### SkeletonImage
Image placeholder skeleton.

```jsx
import { SkeletonImage } from './skeletons';

<SkeletonImage width="100%" height="200px" className="rounded-lg" />
```

### ShimmerEffect
Wrapper component that adds shimmer animation to any content.

```jsx
import { ShimmerEffect } from './skeletons';

<ShimmerEffect className="rounded-lg">
  <div className="h-20 bg-gray-200"></div>
</ShimmerEffect>
```

## Usage Guidelines

### 1. Match Content Structure
Always ensure skeleton components match the actual content structure:

```jsx
// Good: Matches the actual vehicle card structure
<CardSkeleton showImage={true} showActions={true} />

// Bad: Doesn't match - no image in actual content
<CardSkeleton showImage={false} showActions={true} />
```

### 2. Consistent Timing
Use consistent loading times across similar components:

```jsx
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetchData().finally(() => {
    // Add minimum loading time for better UX
    setTimeout(() => setLoading(false), 500);
  });
}, []);
```

### 3. Accessibility
All skeleton components include proper ARIA labels:

```jsx
// Automatically included
<div role="status" aria-label="Loading content">
  {/* Skeleton content */}
</div>
```

### 4. Responsive Design
Skeletons automatically adapt to different screen sizes using Tailwind's responsive classes.

## Animation

The skeletons use a pulse animation by default. For enhanced shimmer effects, use the `ShimmerEffect` wrapper:

```jsx
<ShimmerEffect>
  <CardSkeleton />
</ShimmerEffect>
```

## Customization

### Custom Skeleton
Create custom skeletons by combining utility components:

```jsx
const CustomSkeleton = () => (
  <div className="animate-pulse space-y-4">
    <SkeletonCircle size="4rem" />
    <SkeletonLine width="60%" />
    <SkeletonLine width="80%" />
    <SkeletonButton width="100px" />
  </div>
);
```

### Theming
Customize colors by overriding Tailwind classes:

```jsx
<CardSkeleton className="[&_.bg-gray-200]:bg-blue-100" />
```

## Best Practices

1. **Use appropriate skeleton types** for different content layouts
2. **Match skeleton dimensions** to actual content
3. **Include loading states** for all async operations
4. **Provide fallback content** when skeletons aren't suitable
5. **Test on different screen sizes** to ensure responsiveness
6. **Consider performance** - don't over-animate on slower devices

## Integration Examples

### Fleet Management
```jsx
if (loading) {
  return activeTab === 'vehicles' ? 
    <GridSkeleton items={6} columns={3} /> : 
    <TableSkeleton rows={8} columns={7} />;
}
```

### Dashboard
```jsx
if (loading) {
  return <DashboardSkeleton showStats={true} showCharts={true} />;
}
```

### Forms
```jsx
if (loading) {
  return <FormSkeleton sections={4} fieldsPerSection={3} />;
}
```
