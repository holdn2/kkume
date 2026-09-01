import { Redirect } from 'expo-router';

// 앱을 열면 꿈로그부터 보인다. 탭 그룹에는 index가 없어야
// 각 탭이 자기 폴더(log · community · quick · my)를 그대로 가진다.
export default function Index() {
  return <Redirect href="/log" />;
}
