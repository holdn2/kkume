/**
 * 공용 컴포넌트의 **바깥을 향한 문 하나**.
 *
 * 화면은 여기로 들어온다 — `import { Button, Card } from '@components'`.
 *
 * **이 폴더 안에서는 이 파일을 쓰지 않는다.** `Input.tsx`가 `Row`를 가져올 때는
 * `./layout`을 직접 부른다. 안쪽에서 배럴을 거치면 `Input → index → layout → index`
 * 같은 순환이 생기는데, **RN에서 순환 참조는 에러가 아니라 `undefined`로 나타난다** —
 * 렌더 중에 "Element type is invalid"만 뜨고 어느 줄이 원인인지 알려주지 않는다.
 */
export { Avatar } from './Avatar';
export { Badge } from './Badge';
export { Button } from './Button';
export { Card } from './Card';
export { Input } from './Input';
export { ListRow } from './ListRow';
export { Progress } from './Progress';
export { Radio } from './Radio';
export { Segmented } from './Segmented';
export { Sheet } from './Sheet';
export { Skeleton } from './Skeleton';
export { Switch } from './Switch';
export { Toast } from './Toast';
export { Row, Screen, Spacer, Stack, Title } from './layout';
